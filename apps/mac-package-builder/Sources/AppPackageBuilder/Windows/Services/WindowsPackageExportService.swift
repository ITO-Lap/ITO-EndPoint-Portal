import Foundation

/// Everything the export step needs to know about a completed packaging job.
/// Deliberately narrow: this service does no networking of its own — the
/// wizard/job service has already fetched any agent artifacts (the installer,
/// and the `.intunewin` file when requested) to local temp files before
/// calling `export`.
struct WindowsPackageJobOutcome: Equatable {
    var applicationName: String
    var applicationVersion: String
    var publisher: String
    var job: WindowsBuildJob

    /// Local path to the fetched `.intunewin` artifact. Required when the
    /// caller passes `includeIntuneWin: true`.
    var intuneWinFileURL: URL?
}

/// JSON manifest written alongside the exported Windows package, mirroring
/// `BuildManifest`'s role and `encodedJSON()` helper for the macOS flow.
struct WindowsBuildManifest: Codable {
    let applicationName: String
    let applicationVersion: String
    let publisher: String
    let jobId: UUID
    let architecture: WinGetPackageDetail.Architecture
    let minimumWindowsVersion: String
    let installContext: WindowsPackageConfiguration.InstallContext
    let buildDate: Date
    let builderApplicationVersion: String
    let includesIntuneWin: Bool
    let outputFiles: [String]

    static let currentBuilderVersion = BuildManifest.currentBuilderVersion

    func encodedJSON() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(self)
    }
}

enum WindowsPackageExportError: LocalizedError, Equatable {
    case missingIntuneWinArtifact
    case outputExists(String)

    var errorDescription: String? {
        switch self {
        case .missingIntuneWinArtifact:
            return "includeIntuneWin was requested but no .intunewin artifact was fetched from the agent."
        case .outputExists(let name):
            return "\(name) already exists at the destination."
        }
    }
}

/// Assembles the `Application-Version-Windows/` export folder described in
/// the brief: `Installer/`, generated scripts, an optional `.intunewin`
/// artifact, a JSON manifest, and human-readable reports/guides. All content
/// here is either text this app generated locally (`WindowsScriptGeneratorService`,
/// `WindowsDetectionGeneratorService`) or a file already fetched from the
/// agent — no Windows tool runs as part of this call, and no unvalidated path
/// is ever written to. Mirrors `PackageBuilderService`'s "auditable output,
/// real facts not guesses" spirit.
final class WindowsPackageExportService {
    private let scriptGenerator: WindowsScriptGeneratorService
    private let detectionGenerator: WindowsDetectionGeneratorService

    init(
        scriptGenerator: WindowsScriptGeneratorService = WindowsScriptGeneratorService(),
        detectionGenerator: WindowsDetectionGeneratorService = WindowsDetectionGeneratorService()
    ) {
        self.scriptGenerator = scriptGenerator
        self.detectionGenerator = detectionGenerator
    }

    func export(
        to directory: URL,
        jobOutcome: WindowsPackageJobOutcome,
        configuration: WindowsPackageConfiguration,
        validationReport: WindowsValidationReport,
        includeIntuneWin: Bool,
        installerFileURL: URL
    ) throws -> URL {
        if includeIntuneWin && jobOutcome.intuneWinFileURL == nil {
            throw WindowsPackageExportError.missingIntuneWinArtifact
        }

        let canonicalDestinationRoot = try PathValidator.canonicalize(directory.path)
        let folderName = PackageOutputPathing.sanitizedFileNameComponent(
            "\(jobOutcome.applicationName)-\(jobOutcome.applicationVersion)-Windows",
            fallback: "WindowsPackage-\(jobOutcome.job.id.uuidString)"
        )
        let exportRoot = canonicalDestinationRoot.appendingPathComponent(folderName, isDirectory: true)
        try PathValidator.require(exportRoot, toBeWithin: canonicalDestinationRoot)

        let installerDir = exportRoot.appendingPathComponent("Installer", isDirectory: true)
        try FileManager.default.createDirectory(at: installerDir, withIntermediateDirectories: true)

        // Installer
        let installerDestination = installerDir.appendingPathComponent(installerFileURL.lastPathComponent)
        try copyReplacingExisting(from: installerFileURL, to: installerDestination)

        // Scripts
        let installScript = scriptGenerator.generateInstallScript(configuration: configuration)
        let uninstallScript = scriptGenerator.generateUninstallScript(configuration: configuration)
        let detectionRule: DetectionRule = configuration.detectionRules.count == 1
            ? configuration.detectionRules[0]
            : .combined(operator: .and, rules: configuration.detectionRules)
        let detectionScript = configuration.detectionRules.isEmpty
            ? "# No detection rules were configured for this package.\nWrite-Output 'NO_DETECTION_RULES_CONFIGURED'\nexit 1\n"
            : detectionGenerator.generateDetectionScript(rules: detectionRule)
        let requirementsScript = detectionGenerator.generateRequirementsScript(configuration: configuration)

        try installScript.write(to: exportRoot.appendingPathComponent("Install.ps1"), atomically: true, encoding: .utf8)
        try uninstallScript.write(to: exportRoot.appendingPathComponent("Uninstall.ps1"), atomically: true, encoding: .utf8)
        try detectionScript.write(to: exportRoot.appendingPathComponent("Detect.ps1"), atomically: true, encoding: .utf8)
        try requirementsScript.write(to: exportRoot.appendingPathComponent("Requirements.ps1"), atomically: true, encoding: .utf8)

        var outputFiles = [
            "Installer/\(installerDestination.lastPathComponent)",
            "Install.ps1",
            "Uninstall.ps1",
            "Detect.ps1",
            "Requirements.ps1",
        ]

        // .intunewin (optional)
        if includeIntuneWin, let intuneWinFileURL = jobOutcome.intuneWinFileURL {
            let intuneWinDestination = exportRoot.appendingPathComponent("Package.intunewin")
            try copyReplacingExisting(from: intuneWinFileURL, to: intuneWinDestination)
            outputFiles.append("Package.intunewin")
        }

        // Manifest
        let manifest = WindowsBuildManifest(
            applicationName: jobOutcome.applicationName,
            applicationVersion: jobOutcome.applicationVersion,
            publisher: jobOutcome.publisher,
            jobId: jobOutcome.job.id,
            architecture: configuration.architecture,
            minimumWindowsVersion: configuration.minimumWindowsVersion,
            installContext: configuration.installContext,
            buildDate: Date(),
            builderApplicationVersion: WindowsBuildManifest.currentBuilderVersion,
            includesIntuneWin: includeIntuneWin,
            outputFiles: outputFiles + ["Manifest.json", "Validation-Report.html", "Intune-Deployment-Guide.txt", "EndpointCentral-Deployment-Guide.txt"]
        )
        try manifest.encodedJSON().write(to: exportRoot.appendingPathComponent("Manifest.json"))

        // Validation report
        let reportHTML = generateValidationReportHTML(manifest: manifest, validationReport: validationReport)
        try reportHTML.write(to: exportRoot.appendingPathComponent("Validation-Report.html"), atomically: true, encoding: .utf8)

        // Deployment guides
        try generateIntuneGuide(manifest: manifest, configuration: configuration)
            .write(to: exportRoot.appendingPathComponent("Intune-Deployment-Guide.txt"), atomically: true, encoding: .utf8)
        try generateEndpointCentralGuide(manifest: manifest, configuration: configuration)
            .write(to: exportRoot.appendingPathComponent("EndpointCentral-Deployment-Guide.txt"), atomically: true, encoding: .utf8)

        return exportRoot
    }

    private func copyReplacingExisting(from source: URL, to destination: URL) throws {
        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }
        try FileManager.default.copyItem(at: source, to: destination)
    }

    // MARK: - HTML report

    private func generateValidationReportHTML(manifest: WindowsBuildManifest, validationReport: WindowsValidationReport) -> String {
        var html = "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n"
        html += "<title>Validation Report — \(escape(manifest.applicationName))</title>\n"
        html += stylesheet
        html += "</head>\n<body>\n"
        html += "<h1>\(escape(manifest.applicationName)) \(escape(manifest.applicationVersion))</h1>\n"
        html += "<p class=\"meta\">Publisher: \(escape(manifest.publisher)) &middot; Architecture: \(escape(manifest.architecture.rawValue)) &middot; Built \(isoDate(manifest.buildDate))</p>\n"

        html += "<h2>Hash Verification</h2>\n<ul>\n"
        html += "<li>Actual SHA-256: \(escape(validationReport.actualSHA256))</li>\n"
        html += "<li>Expected SHA-256: \(escape(validationReport.expectedSHA256 ?? "not published"))</li>\n"
        html += "<li>Match: <span class=\"badge \(validationReport.hashMatches ? "pass" : "fail")\">\(validationReport.hashMatches ? "MATCH" : "MISMATCH")</span></li>\n"
        html += "</ul>\n"

        html += "<h2>Authenticode</h2>\n<ul>\n"
        html += "<li>Status: <span class=\"badge \(authenticodeBadgeClass(validationReport.authenticodeStatus))\">\(escape(validationReport.authenticodeStatus.displayName))</span></li>\n"
        html += "<li>Publisher: \(escape(validationReport.publisher ?? "unknown"))</li>\n"
        html += "<li>Signing certificate: \(escape(validationReport.signingCertificateSubject ?? "unknown"))</li>\n"
        html += "<li>Timestamp: \(validationReport.timestamp.map(isoDate) ?? "unknown")</li>\n"
        html += "<li>Certificate expiration: \(validationReport.certificateExpiration.map(isoDate) ?? "unknown")</li>\n"
        html += "</ul>\n"

        html += "<h2>Installer Metadata</h2>\n<ul>\n"
        html += "<li>Installer type: \(escape(validationReport.installerType.displayName))</li>\n"
        html += "<li>File version: \(escape(validationReport.fileVersion ?? "unknown"))</li>\n"
        html += "<li>Product version: \(escape(validationReport.productVersion ?? "unknown"))</li>\n"
        html += "<li>MSI product code: \(escape(validationReport.msiProductCode ?? "n/a"))</li>\n"
        html += "</ul>\n"

        if let override = validationReport.adminOverride {
            html += "<h2>Admin Override</h2>\n<ul>\n"
            html += "<li>Reason: \(escape(override.reason))</li>\n"
            html += "<li>Approved by: \(escape(override.approvedBy))</li>\n"
            html += "<li>Approved at: \(isoDate(override.approvedAt))</li>\n"
            html += "</ul>\n"
        }

        html += "<h2>Output Files</h2>\n<ul>\n"
        for file in manifest.outputFiles {
            html += "<li>\(escape(file))</li>\n"
        }
        html += "</ul>\n"

        html += "<p class=\"footer\">Generated by App Package Builder \(escape(manifest.builderApplicationVersion))</p>\n"
        html += "</body>\n</html>\n"
        return html
    }

    private func authenticodeBadgeClass(_ status: WindowsValidationReport.AuthenticodeStatus) -> String {
        switch status {
        case .validSigned: return "pass"
        case .invalidSigned: return "fail"
        case .unsigned: return "warning"
        case .unknown: return "warning"
        }
    }

    private func escape(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")
    }

    private func isoDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return escape(formatter.string(from: date))
    }

    private var stylesheet: String {
        """
        <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 2rem; color: #1c1c1e; background: #fff; }
        h1 { margin-bottom: 0.2rem; }
        .meta { color: #666; margin-top: 0; }
        .badge { padding: 2px 8px; border-radius: 6px; font-weight: 600; }
        .badge.pass { background: #d4efdf; color: #1e8449; }
        .badge.warning { background: #fdebd0; color: #b9770e; }
        .badge.fail { background: #f5b7b1; color: #922b21; }
        .footer { color: #999; font-size: 0.8rem; margin-top: 2rem; }
        </style>
        """
    }

    // MARK: - Deployment guides

    private func generateIntuneGuide(manifest: WindowsBuildManifest, configuration: WindowsPackageConfiguration) -> String {
        """
        Intune Deployment Guide — \(manifest.applicationName) \(manifest.applicationVersion)
        =================================================================

        1. In the Microsoft Intune admin center, go to Apps > Windows > Add.
        2. App type: "Windows app (Win32)".
        3. Select Package.intunewin from this export folder as the app package file.
           \(manifest.includesIntuneWin ? "(Included in this export.)" : "(Not included in this export — package it with IntuneWinAppUtil.exe first.)")
        4. Install command: run Install.ps1 via PowerShell (e.g.
           powershell.exe -NoProfile -ExecutionPolicy Bypass -File Install.ps1).
        5. Uninstall command: run Uninstall.ps1 the same way.
        6. Install behavior: \(configuration.installContext.displayName).
        7. Detection rules: use a custom script and point it at Detect.ps1 —
           it exits 0 when detected, 1 when not.
        8. Requirements: use a custom script and point it at Requirements.ps1 —
           it exits 0 when requirements are met.
        9. Return codes: configure using the table below.

        Return Codes
        ------------
        \(configuration.returnCodes.sorted(by: { $0.key < $1.key }).map { "  \($0.key): \($0.value)" }.joined(separator: "\n"))

        This guide was generated from the actual configuration used to build
        this export — nothing here is a generic template.
        """
    }

    private func generateEndpointCentralGuide(manifest: WindowsBuildManifest, configuration: WindowsPackageConfiguration) -> String {
        """
        Endpoint Central Deployment Guide — \(manifest.applicationName) \(manifest.applicationVersion)
        ================================================================================

        1. In Endpoint Central, go to Software Deployment > Packages > Add Package.
        2. Package type: "Script based installation".
        3. Upload the Installer/ folder contents alongside Install.ps1.
        4. Install command: powershell.exe -NoProfile -ExecutionPolicy Bypass -File Install.ps1
        5. Uninstall command: powershell.exe -NoProfile -ExecutionPolicy Bypass -File Uninstall.ps1
        6. Install context: \(configuration.installContext.displayName).
        7. Use Detect.ps1 as the detection script (exit 0 = installed).
        8. Use Requirements.ps1 as a pre-deployment requirement check.
        9. Minimum Windows version: \(configuration.minimumWindowsVersion).

        This guide was generated from the actual configuration used to build
        this export — nothing here is a generic template.
        """
    }
}
