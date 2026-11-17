import Foundation

enum WinTunerCommandRunnerError: LocalizedError {
    case scriptNotFound
    case commandFailed(exitCode: Int32, stderr: String)
    case invalidCheckOutput(String)

    var errorDescription: String? {
        switch self {
        case .scriptNotFound:
            return "The WinGet Packager bridge script (setup-winget-packager-macos.sh) was not found in the app bundle."
        case .commandFailed(let exitCode, let stderr):
            let trimmed = AnsiStripper.strip(stderr).trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.contains("404") && trimmed.localizedCaseInsensitiveContains("not found") {
                return "WinGet no longer lists this package or version (404 Not Found). It may have been removed or replaced by a newer release — search again and pick the current version."
            }
            if trimmed.localizedCaseInsensitiveContains("copying content to a stream")
                || trimmed.localizedCaseInsensitiveContains("task was canceled") {
                return "The installer download was interrupted (network dropped or timed out). Check your connection or VPN and press Retry."
            }
            return trimmed.isEmpty
                ? "The command failed (exit code \(exitCode))."
                : "The command failed (exit code \(exitCode)): \(trimmed)"
        case .invalidCheckOutput(let raw):
            return "Could not parse dependency check output: \(raw)"
        }
    }
}

/// Concrete `WinTunerCommandRunning` implementation. Resolves the bundled
/// bash bridge script via `Bundle.module` and invokes it through
/// `ProcessRunner`, matching the script's real CLI surface (actions:
/// check/install/update/package/test; flags: --yes, --json, --package-id,
/// --output, --version, --architecture, --context, --installer-type,
/// --locale, --installer-arguments) exactly. Every value is a discrete argv
/// element — nothing is ever string-interpolated into a shell command.
final class WinTunerCommandRunner: WinTunerCommandRunning {
    private let processRunner: ProcessRunning
    private let installerDownloader: WinGetInstallerDownloading
    /// Injectable override for the bundled script's location, used only by
    /// tests (production call sites always pass `nil` and get the real
    /// `Bundle.module` resolution below) since `Bundle.module` itself can't
    /// be swapped out in a unit test.
    private let scriptURLOverride: URL?
    /// Resolves the latest published manifest; only used after the script
    /// reports a version fallback. Injectable so tests never hit the network.
    private let latestManifestProvider: @Sendable (String, WinGetArchitecture, WinGetInstallerType?) async throws -> WinGetInstallerManifest

    static let plainTextEnvironment: [String: String] = {
        var env = ProcessInfo.processInfo.environment
        env["NO_COLOR"] = "1"
        env["TERM"] = "dumb"
        return env
    }()

    init(
        processRunner: ProcessRunning = ProcessRunner(),
        scriptURLOverride: URL? = nil,
        installerDownloader: WinGetInstallerDownloading = WinGetInstallerDownloader(),
        latestManifestProvider: @escaping @Sendable (String, WinGetArchitecture, WinGetInstallerType?) async throws -> WinGetInstallerManifest = { id, arch, type in
            try await WinGetManifestService().fetchInstallerManifest(packageId: id, version: nil, architecture: arch, installerType: type)
        }
    ) {
        self.processRunner = processRunner
        self.scriptURLOverride = scriptURLOverride
        self.installerDownloader = installerDownloader
        self.latestManifestProvider = latestManifestProvider
    }

    /// Wraps a log sink so ANSI color codes never reach the UI.
    private static func plain(_ log: @escaping @Sendable (String) -> Void) -> @Sendable (String) -> Void {
        { line in
            // WinTuner's module emits this harmless internal logging glitch once per line.
            guard !line.contains("Write log to PowerShell failed") else { return }
            log(AnsiStripper.strip(line))
        }
    }

    private func resolveScriptPath() throws -> String {
        if let scriptURLOverride {
            return scriptURLOverride.path
        }
        if let url = Bundle.module.url(
            forResource: "setup-winget-packager-macos",
            withExtension: "sh",
            subdirectory: "Scripts"
        ) {
            return url.path
        }
        if let url = Bundle.module.url(
            forResource: "setup-winget-packager-macos",
            withExtension: "sh"
        ) {
            return url.path
        }
        throw WinTunerCommandRunnerError.scriptNotFound
    }

    func checkDependencies() async throws -> DependencyStatus {
        let scriptPath = try resolveScriptPath()
        let output = try await processRunner.run(
            "/bin/bash",
            arguments: [scriptPath, "check", "--json"],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: nil
        )

        // `check` exits 0 when fully ready and 2 when diagnostics completed
        // but the environment isn't ready yet — both are "successful reads"
        // of the JSON payload, not failures.
        guard output.exitCode == 0 || output.exitCode == 2 else {
            throw WinTunerCommandRunnerError.commandFailed(exitCode: output.exitCode, stderr: output.stderr)
        }

        let jsonLine = output.stdout
            .split(separator: "\n", omittingEmptySubsequences: true)
            .last.map(String.init) ?? output.stdout

        guard let data = jsonLine.trimmingCharacters(in: .whitespacesAndNewlines).data(using: .utf8) else {
            throw WinTunerCommandRunnerError.invalidCheckOutput(output.stdout)
        }
        do {
            return try JSONDecoder().decode(DependencyStatus.self, from: data)
        } catch {
            throw WinTunerCommandRunnerError.invalidCheckOutput(output.stdout)
        }
    }

    func installDependencies(log: @escaping @Sendable (String) -> Void) async throws {
        let scriptPath = try resolveScriptPath()
        try Task.checkCancellation()
        let output = try await processRunner.run(
            "/bin/bash",
            arguments: [scriptPath, "install", "--yes"],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: Self.plain(log)
        )
        guard output.exitCode == 0 else {
            throw WinTunerCommandRunnerError.commandFailed(exitCode: output.exitCode, stderr: output.stderr)
        }
    }

    func updateWinTuner(log: @escaping @Sendable (String) -> Void) async throws {
        let scriptPath = try resolveScriptPath()
        try Task.checkCancellation()
        let output = try await processRunner.run(
            "/bin/bash",
            arguments: [scriptPath, "update", "--yes"],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: Self.plain(log)
        )
        guard output.exitCode == 0 else {
            throw WinTunerCommandRunnerError.commandFailed(exitCode: output.exitCode, stderr: output.stderr)
        }
    }

    func runTestPackage(
        outputDirectory: String,
        log: @escaping @Sendable (String) -> Void,
        isCancelled: @escaping () -> Bool
    ) async throws -> WinTunerPackageResult {
        let scriptPath = try resolveScriptPath()
        try Task.checkCancellation()
        guard !isCancelled() else { throw CancellationError() }
        let startedAt = Date()

        let output = try await processRunner.run(
            "/bin/bash",
            arguments: [scriptPath, "test", "--output", outputDirectory, "--yes"],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: Self.plain(log)
        )

        try Task.checkCancellation()

        guard output.exitCode == 0 else {
            throw WinTunerCommandRunnerError.commandFailed(exitCode: output.exitCode, stderr: output.stderr)
        }

        let outputURLs = discoverDeploymentArtifacts(stdout: output.stdout, outputDirectory: outputDirectory)

        return WinTunerPackageResult(
            manifestResolved: true,
            installerDownloaded: true,
            sha256Verified: false,
            scriptsGenerated: true,
            intuneWinCreated: outputURLs.contains { $0.pathExtension.lowercased() == "intunewin" },
            stdout: AnsiStripper.strip(output.stdout),
            stderr: AnsiStripper.strip(output.stderr),
            exitCode: output.exitCode,
            outputFileURLs: outputURLs,
            startedAt: startedAt,
            finishedAt: Date()
        )
    }

    func package(
        configuration: WinTunerPackageConfiguration,
        manifest: WinGetInstallerManifest,
        log: @escaping @Sendable (String) -> Void,
        isCancelled: @escaping () -> Bool
    ) async throws -> WinTunerPackageResult {
        let scriptPath = try resolveScriptPath()
        try Task.checkCancellation()
        guard !isCancelled() else { throw CancellationError() }
        let startedAt = Date()
        let packageOutputDirectory = WinTunerOutputNaming.applicationOutputDirectory(
            baseDirectory: configuration.outputDirectory,
            applicationName: manifest.expectedOutputName,
            packageId: manifest.packageId
        )
        try FileManager.default.createDirectory(
            at: URL(fileURLWithPath: packageOutputDirectory, isDirectory: true),
            withIntermediateDirectories: true
        )

        var arguments: [String] = [
            scriptPath, "package",
            "--package-id", manifest.packageId,
            "--output", packageOutputDirectory,
            "--version", configuration.version,
            "--architecture", configuration.architecture.scriptValue,
            "--context", configuration.context.scriptValue
        ]
        let installerTypeValue = configuration.installerType.scriptValue ?? manifest.installerType.scriptValue
        arguments += ["--installer-type", installerTypeValue]
        if !configuration.locale.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            arguments += ["--locale", configuration.locale]
        }
        if !configuration.silentInstallerArguments.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            arguments += ["--installer-arguments", configuration.silentInstallerArguments]
        }

        let output = try await processRunner.run(
            "/bin/bash",
            arguments: arguments,
            currentDirectory: nil,
            environment: Self.plainTextEnvironment,
            onOutputLine: Self.plain(log)
        )

        try Task.checkCancellation()

        guard output.exitCode == 0 else {
            throw WinTunerCommandRunnerError.commandFailed(exitCode: output.exitCode, stderr: output.stderr)
        }

        // The script falls back to the latest published version when the
        // requested one is gone from winget-pkgs. Keep the optional original
        // installer download consistent with what was actually packaged.
        var effectiveManifest = manifest
        var skipInstallerDownload = false
        if output.stdout.contains("BPB_VERSION_FALLBACK=1") {
            log("Requested version \(manifest.version) is no longer published; packaged the latest available version instead.")
            if configuration.downloadOriginalInstaller {
                do {
                    effectiveManifest = try await latestManifestProvider(
                        manifest.packageId, configuration.architecture, configuration.installerType.explicitType
                    )
                } catch {
                    skipInstallerDownload = true
                    log("Could not resolve the latest manifest (\(error.localizedDescription)); skipping the original installer download so it can't mismatch the package.")
                }
            }
        }

        let packageOutputURL = URL(fileURLWithPath: packageOutputDirectory, isDirectory: true)
        let downloadedInstaller: WinGetInstallerDownloadResult?
        if configuration.downloadOriginalInstaller && !skipInstallerDownload {
            downloadedInstaller = try await installerDownloader.downloadInstaller(
                manifest: effectiveManifest,
                applicationName: effectiveManifest.expectedOutputName,
                to: packageOutputURL
            )
        } else {
            downloadedInstaller = nil
        }

        var outputURLs = discoverDeploymentArtifacts(stdout: output.stdout, outputDirectory: packageOutputDirectory)
        if let downloadedInstaller {
            outputURLs.append(downloadedInstaller.fileURL)
        }
        let intuneWinCreated = configuration.createIntuneWin
            && outputURLs.contains { $0.pathExtension.lowercased() == "intunewin" }

        return WinTunerPackageResult(
            manifestResolved: true,
            installerDownloaded: downloadedInstaller != nil,
            sha256Verified: downloadedInstaller?.sha256Verified ?? false,
            scriptsGenerated: configuration.generateInstallScript
                || configuration.generateUninstallScript
                || configuration.generateDetectScript
                || configuration.generateRequirementsScript,
            intuneWinCreated: intuneWinCreated,
            stdout: AnsiStripper.strip(output.stdout),
            stderr: AnsiStripper.strip(output.stderr),
            exitCode: output.exitCode,
            outputFileURLs: outputURLs,
            startedAt: startedAt,
            finishedAt: Date()
        )
    }

    /// Discover supported Intune deployment artifacts from disk, with stdout
    /// as a fallback for tools that report a path outside the output root.
    private func discoverDeploymentArtifacts(stdout: String, outputDirectory: String) -> [URL] {
        var found: [URL] = []
        let supportedExtensions: Set<String> = ["intunewin", "msi"]

        let expandedOutputDir = (outputDirectory as NSString).expandingTildeInPath
        if let enumerator = FileManager.default.enumerator(
            at: URL(fileURLWithPath: expandedOutputDir),
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) {
            for case let fileURL as URL in enumerator where supportedExtensions.contains(fileURL.pathExtension.lowercased()) {
                found.append(fileURL)
            }
        }

        for line in stdout.split(separator: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if let token = trimmed.split(separator: " ").first(where: {
                supportedExtensions.contains(URL(fileURLWithPath: String($0)).pathExtension.lowercased())
            }) {
                found.append(URL(fileURLWithPath: String(token)))
            }
        }

        return Array(Set(found)).sorted {
            let lhsExtension = $0.pathExtension.lowercased()
            let rhsExtension = $1.pathExtension.lowercased()
            if lhsExtension != rhsExtension {
                return lhsExtension == "intunewin"
            }
            return $0.path < $1.path
        }
    }
}
