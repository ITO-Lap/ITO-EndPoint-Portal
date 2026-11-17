import Foundation
import CryptoKit

struct BuildOutcome {
    let packagePath: URL
    let detectionScriptPath: URL
    let uninstallScriptPath: URL
    let manifestPath: URL
    let deploymentGuidePath: URL
    let validationReportPath: URL
    let isSigned: Bool
    let isNotarized: Bool
    let inspection: PackageInspectionReport?
}

enum PackageBuilderError: LocalizedError {
    case unsupportedEnterprisePayload(String)
    case checksumMismatch
    case downloadFailed(String)
    case cancelled
    case outputExists(URL)

    var errorDescription: String? {
        switch self {
        case .unsupportedEnterprisePayload(let reason):
            return "Enterprise Payload mode is not supported for this package yet: \(reason). Use Online Installer mode instead."
        case .checksumMismatch:
            return "Downloaded artifact's SHA-256 checksum did not match Homebrew's recorded checksum. Aborting for safety."
        case .downloadFailed(let reason):
            return "Download failed: \(reason)"
        case .cancelled:
            return "Build cancelled."
        case .outputExists(let url):
            return "\(url.lastPathComponent) already exists. Enable overwrite or choose a different output location."
        }
    }
}

/// Orchestrates one end-to-end package build. All child-process invocations
/// go through `ProcessRunner` with argument arrays (never an interpolated
/// shell string), all filesystem writes are confined to a validated output
/// directory or a per-build temp directory that is removed via
/// `PathValidator.removeContentsSafely`, and every value written into a
/// generated script has already passed `PackageConfiguration.validateStrictFields()`.
final class PackageBuilderService {
    private let processRunner: ProcessRunner
    private let scriptGenerator: ScriptGeneratorServicing
    private let signingService: SigningServicing
    private let notarizationService: NotarizationServicing
    private let homebrewService: HomebrewServicing
    private let packageInspector: PackageInspectorServicing
    private let reportService: ReportServicing

    init(
        processRunner: ProcessRunner = ProcessRunner(),
        scriptGenerator: ScriptGeneratorServicing = ScriptGeneratorService(),
        signingService: SigningServicing = SigningService(),
        notarizationService: NotarizationServicing = NotarizationService(),
        homebrewService: HomebrewServicing = HomebrewService(),
        packageInspector: PackageInspectorServicing = PackageInspectorService(),
        reportService: ReportServicing = ReportService()
    ) {
        self.processRunner = processRunner
        self.scriptGenerator = scriptGenerator
        self.signingService = signingService
        self.notarizationService = notarizationService
        self.homebrewService = homebrewService
        self.packageInspector = packageInspector
        self.reportService = reportService
    }

    func cancel() {
        processRunner.cancelActive()
    }

    func build(
        configuration: PackageConfiguration,
        packageInfo: BrewPackageInfo,
        signingIdentity: SigningIdentity?,
        validation: ValidationSummary,
        log: @escaping @Sendable (String) -> Void,
        isCancelled: @escaping () -> Bool
    ) async throws -> BuildOutcome {
        try configuration.validateStrictFields()
        try Task.checkCancellation()

        // Every app gets its own subfolder under the configured output
        // directory (e.g. ~/Desktop/Packages/slack, ~/Desktop/Packages/opera)
        // rather than dumping every build's files flat into one directory.
        // `homebrewToken` has already passed `Validators.isValidToken` via
        // `validateStrictFields()` above, so it's safe to use directly as a
        // path component (no slashes or traversal characters).
        let baseOutputDir = try PathValidator.canonicalize(configuration.outputDirectory)
        let outputDir = baseOutputDir.appendingPathComponent(configuration.homebrewToken, isDirectory: true)
        try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

        let tempRoot = FileManager.default.temporaryDirectory
        let buildDir = tempRoot.appendingPathComponent("AppPackageBuilder-\(UUID().uuidString)", isDirectory: true)
        let scriptsDir = buildDir.appendingPathComponent("scripts", isDirectory: true)
        let payloadDir = buildDir.appendingPathComponent("payload", isDirectory: true)
        try FileManager.default.createDirectory(at: scriptsDir, withIntermediateDirectories: true)

        defer {
            try? PathValidator.removeContentsSafely(buildDir, mustBeWithin: tempRoot)
        }

        do {
            log("Generating install/detection/uninstall scripts...")
            let postinstall = try scriptGenerator.generatePostinstallScript(configuration: configuration, packageInfo: packageInfo)
            let detection = try scriptGenerator.generateDetectionScript(configuration: configuration, packageInfo: packageInfo)
            let uninstall = try scriptGenerator.generateUninstallScript(configuration: configuration, packageInfo: packageInfo)

            let postinstallPath = scriptsDir.appendingPathComponent("postinstall")
            try postinstall.write(to: postinstallPath, atomically: true, encoding: .utf8)
            try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: postinstallPath.path)

            let baseName = configuration.homebrewToken
            let detectionPath = outputDir.appendingPathComponent("\(baseName)-detect.sh")
            let uninstallPath = outputDir.appendingPathComponent("\(baseName)-uninstall.sh")
            try detection.write(to: detectionPath, atomically: true, encoding: .utf8)
            try uninstall.write(to: uninstallPath, atomically: true, encoding: .utf8)
            try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: detectionPath.path)
            try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: uninstallPath.path)

            try Task.checkCancellation()

            var sourceURLForManifest = packageInfo.sourceURL
            var checksumForManifest = packageInfo.sha256

            // The installer's filename carries the application name and
            // package version (e.g. "Redis-7.2.4.pkg") so it's identifiable
            // at a glance in Endpoint Central/Finder — not just the bare
            // Homebrew token every other artifact uses.
            let pkgBaseName = PackageOutputPathing.sanitizedFileNameComponent("\(configuration.applicationName)-\(configuration.packageVersion)", fallback: baseName)
            let pkgPath = outputDir.appendingPathComponent("\(pkgBaseName).pkg")
            if !configuration.overwriteExisting && FileManager.default.fileExists(atPath: pkgPath.path) {
                throw PackageBuilderError.outputExists(pkgPath)
            }

            switch configuration.packagingMode {
            case .onlineInstaller:
                log("Building no-payload package (Online Installer mode)...")
                try await runPkgbuild(
                    args: [
                        "--nopayload",
                        "--scripts", scriptsDir.path,
                        "--identifier", configuration.packageIdentifier,
                        "--version", configuration.packageVersion,
                        pkgPath.path
                    ],
                    log: log
                )

            case .enterprisePayload:
                log("Preparing Enterprise Payload (downloading and verifying artifact)...")
                try FileManager.default.createDirectory(at: payloadDir, withIntermediateDirectories: true)
                try await buildEnterprisePayload(
                    configuration: configuration,
                    packageInfo: packageInfo,
                    payloadDir: payloadDir,
                    buildDir: buildDir,
                    log: log,
                    isCancelled: isCancelled
                )
                try Task.checkCancellation()
                log("Building payload package...")
                try await runPkgbuild(
                    args: [
                        "--root", payloadDir.path,
                        "--install-location", "/Applications",
                        "--scripts", scriptsDir.path,
                        "--identifier", configuration.packageIdentifier,
                        "--version", configuration.packageVersion,
                        pkgPath.path
                    ],
                    log: log
                )
            }

            var finalPkgPath = pkgPath
            var isSigned = false
            if configuration.signPackage, let signingIdentity {
                try Task.checkCancellation()
                log("Signing package with \(signingIdentity.commonName)...")
                let signedPath = outputDir.appendingPathComponent("\(pkgBaseName)-signed.pkg")
                try await signingService.sign(packageAt: pkgPath, identity: signingIdentity, outputPath: signedPath)
                finalPkgPath = signedPath
                isSigned = true
                log("Signed: \(signedPath.lastPathComponent)")
            }

            var isNotarized = false
            var notarizationValidationResult: String?
            if configuration.notarizePackage, let profile = configuration.notarizationKeychainProfile, !profile.isEmpty {
                try Task.checkCancellation()
                log("Submitting for notarization using profile \"\(profile)\"...")
                try await notarizationService.submitAndWait(packagePath: finalPkgPath, keychainProfile: profile, onOutputLine: log)
                log("Stapling notarization ticket...")
                try await notarizationService.staple(packagePath: finalPkgPath)
                isNotarized = true
                log("Notarization complete.")
                do {
                    notarizationValidationResult = try await notarizationService.validateStapledTicket(packagePath: finalPkgPath)
                    log("Notarization ticket validated: \(notarizationValidationResult ?? "")")
                } catch {
                    notarizationValidationResult = "Validation failed: \(error.localizedDescription)"
                    log("WARNING: \(notarizationValidationResult ?? "")")
                }
            }

            var signatureVerificationResult: String?
            if isSigned {
                signatureVerificationResult = try? await signingService.verifySignature(of: finalPkgPath)
                if let signatureVerificationResult {
                    log("Signature verification: \(signatureVerificationResult.split(separator: "\n").first.map(String.init) ?? signatureVerificationResult)")
                }
            }

            log("Inspecting built package...")
            let inspection = try? await packageInspector.inspect(packageAt: finalPkgPath)
            if let inspection {
                log("Package contains \(inspection.payloadFileCount) payload file(s), identifier \(inspection.identifier ?? "unknown"), version \(inspection.version ?? "unknown").")
            } else {
                log("WARNING: package inspection failed; Validation-Report.html will note it as unavailable.")
            }

            log("Writing build manifest...")
            let manifest = BuildManifest(
                applicationName: configuration.applicationName,
                homebrewToken: configuration.homebrewToken,
                packageKind: configuration.packageKind,
                applicationVersion: packageInfo.version,
                homebrewVersion: (try? await homebrewService.brewVersion()) ?? "unknown",
                packageReceiptVersion: configuration.packageVersion,
                packageIdentifier: configuration.packageIdentifier,
                architecture: configuration.architecture,
                packagingMode: configuration.packagingMode,
                sourceURL: sourceURLForManifest,
                sha256Checksum: checksumForManifest,
                buildDate: Date(),
                builderApplicationVersion: BuildManifest.currentBuilderVersion,
                signingIdentity: isSigned ? signingIdentity?.commonName : nil,
                outputFiles: [finalPkgPath.lastPathComponent, detectionPath.lastPathComponent, uninstallPath.lastPathComponent, "Validation-Report.html"]
            )
            let manifestPath = outputDir.appendingPathComponent("\(baseName)-manifest.json")
            try manifest.encodedJSON().write(to: manifestPath)

            log("Writing Endpoint Central deployment guide...")
            let guideText = EndpointCentralGuideGenerator.generate(
                configuration: configuration,
                packageInfo: packageInfo,
                packagePath: finalPkgPath,
                detectionScriptPath: detectionPath,
                uninstallScriptPath: uninstallPath
            )
            let guidePath = outputDir.appendingPathComponent("EndpointCentral-Deployment-Guide.txt")
            try guideText.write(to: guidePath, atomically: true, encoding: .utf8)

            log("Writing HTML validation report...")
            let reportHTML = reportService.generateValidationReportHTML(
                manifest: manifest,
                validation: validation,
                inspection: inspection,
                signatureVerification: signatureVerificationResult,
                notarizationValidation: notarizationValidationResult
            )
            let reportPath = outputDir.appendingPathComponent("\(baseName)-Validation-Report.html")
            try reportHTML.write(to: reportPath, atomically: true, encoding: .utf8)

            log("Build complete: \(finalPkgPath.path)")
            _ = sourceURLForManifest
            _ = checksumForManifest

            return BuildOutcome(
                packagePath: finalPkgPath,
                detectionScriptPath: detectionPath,
                uninstallScriptPath: uninstallPath,
                manifestPath: manifestPath,
                deploymentGuidePath: guidePath,
                validationReportPath: reportPath,
                isSigned: isSigned,
                isNotarized: isNotarized,
                inspection: inspection
            )
        } catch is CancellationError {
            throw PackageBuilderError.cancelled
        }
    }


    private func runPkgbuild(args: [String], log: @escaping @Sendable (String) -> Void) async throws {
        let output = try await processRunner.run("/usr/bin/pkgbuild", arguments: args, currentDirectory: nil, environment: nil, onOutputLine: log)
        guard output.exitCode == 0 else {
            throw NSError(domain: "PackageBuilderService", code: Int(output.exitCode), userInfo: [NSLocalizedDescriptionKey: output.stderr.isEmpty ? "pkgbuild failed" : output.stderr])
        }
    }

    // MARK: - Enterprise Payload

    private func buildEnterprisePayload(
        configuration: PackageConfiguration,
        packageInfo: BrewPackageInfo,
        payloadDir: URL,
        buildDir: URL,
        log: @escaping @Sendable (String) -> Void,
        isCancelled: @escaping () -> Bool
    ) async throws {
        guard configuration.packageKind == .cask else {
            throw PackageBuilderError.unsupportedEnterprisePayload("Homebrew formulas may have multiple bottles/dependencies and are not yet supported for offline payload builds")
        }
        guard let sourceURLString = packageInfo.sourceURL, let sourceURL = URL(string: sourceURLString) else {
            throw PackageBuilderError.unsupportedEnterprisePayload("no downloadable artifact URL was reported by Homebrew")
        }
        guard let appName = packageInfo.artifactAppNames.first else {
            throw PackageBuilderError.unsupportedEnterprisePayload("this cask does not declare a standard .app artifact")
        }

        log("Downloading \(sourceURL.lastPathComponent)...")
        let downloadedFile = buildDir.appendingPathComponent("artifact-\(sourceURL.lastPathComponent)")
        try await download(from: sourceURL, to: downloadedFile, log: log)
        try Task.checkCancellation()

        if let expectedChecksum = packageInfo.sha256 {
            log("Verifying SHA-256 checksum...")
            let actual = try sha256Hex(of: downloadedFile)
            guard actual.lowercased() == expectedChecksum.lowercased() else {
                throw PackageBuilderError.checksumMismatch
            }
            log("Checksum verified.")
        } else {
            log("No checksum published by Homebrew for this artifact — skipping verification.")
        }

        let applicationsDir = payloadDir.appendingPathComponent("Applications", isDirectory: true)
        try FileManager.default.createDirectory(at: applicationsDir, withIntermediateDirectories: true)

        let lowerName = sourceURL.lastPathComponent.lowercased()
        if lowerName.hasSuffix(".dmg") {
            try await extractApp(fromDMG: downloadedFile, appName: appName, into: applicationsDir, buildDir: buildDir, log: log)
        } else if lowerName.hasSuffix(".zip") {
            try await extractApp(fromZip: downloadedFile, appName: appName, into: applicationsDir, buildDir: buildDir, log: log)
        } else if lowerName.hasSuffix(".pkg") {
            throw PackageBuilderError.unsupportedEnterprisePayload("this cask ships a signed vendor .pkg installer; re-wrapping it is not supported, download and deploy it directly")
        } else {
            throw PackageBuilderError.unsupportedEnterprisePayload("unrecognized artifact type \"\(sourceURL.pathExtension)\"")
        }

        let appPath = applicationsDir.appendingPathComponent(appName)
        log("Checking code signature of \(appName)...")
        if let signatureInfo = try? await checkCodeSignature(of: appPath) {
            log(signatureInfo)
        } else {
            log("WARNING: \(appName) is not code-signed, or its signature could not be verified. It will still be packaged, but Gatekeeper may warn users on launch — this is not being bypassed.")
        }

        log("Verifying downloaded application version against Homebrew's recorded version...")
        if let installedVersion = try? await readBundleVersion(of: appPath) {
            switch AppVersionComparator.compare(installedVersion, packageInfo.version) {
            case .same:
                log("Version verified: \(appName) reports \(installedVersion), matching Homebrew's \(packageInfo.version).")
            case .ascending, .descending:
                log("WARNING: \(appName) reports version \(installedVersion), but Homebrew records \(packageInfo.version) for this cask. Packaging will continue with the downloaded artifact's actual version.")
            }
        } else {
            log("WARNING: could not read a version from \(appName)'s Info.plist to verify against Homebrew's recorded version \(packageInfo.version).")
        }
    }

    /// Reads `CFBundleShortVersionString` (falling back to `CFBundleVersion`)
    /// from the downloaded `.app` via `PlistBuddy` — the same tool the
    /// generated detection script uses — so "the version we packaged" is a
    /// checked fact about the artifact, not an assumption carried over from
    /// Homebrew's cask metadata.
    private func readBundleVersion(of appPath: URL) async throws -> String? {
        let infoPlistPath = appPath.appendingPathComponent("Contents/Info.plist").path
        for key in ["CFBundleShortVersionString", "CFBundleVersion"] {
            let output = try await processRunner.run(
                "/usr/libexec/PlistBuddy",
                arguments: ["-c", "Print :\(key)", infoPlistPath],
                currentDirectory: nil,
                environment: nil,
                onOutputLine: nil
            )
            let value = output.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
            if output.exitCode == 0, !value.isEmpty {
                return value
            }
        }
        return nil
    }

    private func download(from url: URL, to destination: URL, log: @escaping @Sendable (String) -> Void) async throws {
        let (tempURL, response) = try await URLSession.shared.download(from: url)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw PackageBuilderError.downloadFailed("unexpected server response")
        }
        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }
        try FileManager.default.moveItem(at: tempURL, to: destination)
    }

    private func sha256Hex(of file: URL) throws -> String {
        let data = try Data(contentsOf: file, options: .mappedIfSafe)
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private func extractApp(fromDMG dmg: URL, appName: String, into applicationsDir: URL, buildDir: URL, log: @escaping @Sendable (String) -> Void) async throws {
        let mountPoint = buildDir.appendingPathComponent("mount-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: mountPoint, withIntermediateDirectories: true)
        log("Mounting disk image...")
        let attach = try await processRunner.run(
            "/usr/bin/hdiutil",
            arguments: ["attach", dmg.path, "-nobrowse", "-noautoopen", "-mountpoint", mountPoint.path],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: nil
        )
        guard attach.exitCode == 0 else {
            throw PackageBuilderError.downloadFailed("hdiutil attach failed: \(attach.stderr)")
        }
        defer {
            Task {
                _ = try? await processRunner.run("/usr/bin/hdiutil", arguments: ["detach", mountPoint.path, "-force"], currentDirectory: nil, environment: nil, onOutputLine: nil)
            }
        }

        let sourceApp = mountPoint.appendingPathComponent(appName)
        guard FileManager.default.fileExists(atPath: sourceApp.path) else {
            throw PackageBuilderError.unsupportedEnterprisePayload("\(appName) was not found inside the mounted disk image")
        }
        let destinationApp = applicationsDir.appendingPathComponent(appName)
        log("Copying \(appName) into payload...")
        try FileManager.default.copyItem(at: sourceApp, to: destinationApp)
    }

    private func extractApp(fromZip zip: URL, appName: String, into applicationsDir: URL, buildDir: URL, log: @escaping @Sendable (String) -> Void) async throws {
        let extractDir = buildDir.appendingPathComponent("unzip-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: extractDir, withIntermediateDirectories: true)
        log("Extracting archive...")
        let output = try await processRunner.run("/usr/bin/ditto", arguments: ["-x", "-k", zip.path, extractDir.path], currentDirectory: nil, environment: nil, onOutputLine: nil)
        guard output.exitCode == 0 else {
            throw PackageBuilderError.downloadFailed("archive extraction failed: \(output.stderr)")
        }
        let sourceApp = extractDir.appendingPathComponent(appName)
        guard FileManager.default.fileExists(atPath: sourceApp.path) else {
            throw PackageBuilderError.unsupportedEnterprisePayload("\(appName) was not found inside the extracted archive")
        }
        let destinationApp = applicationsDir.appendingPathComponent(appName)
        log("Copying \(appName) into payload...")
        try FileManager.default.copyItem(at: sourceApp, to: destinationApp)
    }

    private func checkCodeSignature(of appPath: URL) async throws -> String {
        let output = try await processRunner.run("/usr/bin/codesign", arguments: ["-dv", "--verbose=2", appPath.path], currentDirectory: nil, environment: nil, onOutputLine: nil)
        guard output.exitCode == 0 else {
            throw NSError(domain: "codesign", code: Int(output.exitCode))
        }
        return "Signature OK: " + (output.stderr.split(separator: "\n").first.map(String.init) ?? "verified")
    }
}
