import Foundation

enum LocalInstallerError: LocalizedError, Equatable {
    case missingField(String)
    case notAnInstaller(String)
    case unsafeCommand(String)

    var errorDescription: String? {
        switch self {
        case .missingField(let f): return "\(f) is required."
        case .notAnInstaller(let n): return "\(n) is not an .msi, .exe, .msix or .appx installer."
        case .unsafeCommand(let m): return m
        }
    }
}

struct LocalInstallerRequest: Equatable {
    var source: URL              // the chosen file, or the chosen folder
    var isFolder: Bool
    var setupFile: String        // file name (single file) or relative path inside the folder
    var appName: String
    var version: String
    var architecture: LocalArchitecture
    var installCommand: String
    var uninstallCommand: String
    var productCode: String      // optional, MSI only
    var publisher: String = ""
    var outputBase: String
}

struct LocalInstallerOutcome: Equatable {
    let result: IntuneWinResult
    let outputFolder: URL
    let commandsFile: URL
    let infoFile: URL
    /// Intune custom detection script (MSI only, when the ProductCode is known).
    let detectionFile: URL?
    let sourceSHA256: String
}

/// Packages a locally chosen installer into an `.intunewin` with `IntuneWinWriter` and writes the commands and metadata
/// beside it. Never claims Windows testing: the info file records `windowsInstallationTested: false`.
final class LocalInstallerPackagerService {
    private let writer: IntuneWinWriter
    init(writer: IntuneWinWriter = IntuneWinWriter()) { self.writer = writer }

    static func sanitize(_ s: String) -> String {
        let cleaned = s.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "[^A-Za-z0-9._-]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-."))
        return cleaned
    }

    static func outputFileName(appName: String, version: String, architecture: LocalArchitecture) -> String {
        "\(sanitize(appName))-\(sanitize(version))-\(architecture.rawValue).intunewin"
    }

    /// Commands run on Windows, so keep them to a single plain command line: no operators that chain other programs.
    static func validateCommand(_ cmd: String, label: String) throws {
        let forbidden = CharacterSet(charactersIn: "&|;<>^`\r\n")
        if cmd.rangeOfCharacter(from: forbidden) != nil || cmd.contains("$(") {
            throw LocalInstallerError.unsafeCommand("The \(label) command contains shell operators (& | ; < > ^ ` or a new line), which are not allowed.")
        }
    }

    /// An MSI with a known ProductCode never needs a hand-typed uninstall command.
    func resolved(_ r: LocalInstallerRequest) -> LocalInstallerRequest {
        var r = r
        if r.uninstallCommand.trimmingCharacters(in: .whitespaces).isEmpty, !r.productCode.isEmpty, r.setupFile.lowercased().hasSuffix(".msi") {
            r.uninstallCommand = "msiexec /x \"\(r.productCode)\" /qn /norestart"
        }
        return r
    }

    func validate(_ r: LocalInstallerRequest) throws {
        if r.appName.trimmingCharacters(in: .whitespaces).isEmpty { throw LocalInstallerError.missingField("App name") }
        if r.version.trimmingCharacters(in: .whitespaces).isEmpty { throw LocalInstallerError.missingField("Version") }
        if r.installCommand.trimmingCharacters(in: .whitespaces).isEmpty { throw LocalInstallerError.missingField("Install command") }
        if r.uninstallCommand.trimmingCharacters(in: .whitespaces).isEmpty { throw LocalInstallerError.missingField("Uninstall command") }
        guard LocalInstallerKind(rawValue: (r.setupFile as NSString).pathExtension.lowercased()) != nil else { throw LocalInstallerError.notAnInstaller(r.setupFile) }
        try Self.validateCommand(r.installCommand, label: "install")
        try Self.validateCommand(r.uninstallCommand, label: "uninstall")
        if !r.productCode.isEmpty, r.productCode.range(of: "^\\{[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\\}$", options: .regularExpression) == nil {
            throw LocalInstallerError.unsafeCommand("ProductCode must look like {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}.")
        }
    }

    func package(_ request: LocalInstallerRequest, log: @escaping @Sendable (String) -> Void) async throws -> LocalInstallerOutcome {
        let r = resolved(request)
        try validate(r)
        let fm = FileManager.default
        let base = try PathValidator.canonicalize(r.outputBase)
        let folder = base.appendingPathComponent(Self.sanitize(r.appName), isDirectory: true).appendingPathComponent(Self.sanitize(r.version), isDirectory: true)
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)

        var sourceFolder = r.source
        var staging: URL?
        defer { if let staging { try? fm.removeItem(at: staging) } }
        if !r.isFolder {
            // Only the chosen installer is packaged — never the rest of the folder it happens to sit in (e.g. Downloads).
            let dir = fm.temporaryDirectory.appendingPathComponent("localinstaller-\(UUID().uuidString)", isDirectory: true)
            try fm.createDirectory(at: dir, withIntermediateDirectories: true)
            staging = dir
            try fm.copyItem(at: r.source, to: dir.appendingPathComponent(r.setupFile))
            sourceFolder = dir
        }

        log("Packaging \(r.setupFile) …")
        let setupURL = sourceFolder.appendingPathComponent(r.setupFile)
        let sourceHash = try IntuneWinWriter.sha256Hex(of: setupURL)
        let output = folder.appendingPathComponent(Self.outputFileName(appName: r.appName, version: r.version, architecture: r.architecture))
        // For an MSI, embed its own ProductCode/version so the Intune portal can pre-fill Program and Detection.
        var msiInfo: IntuneWinMsiInfo?
        if r.setupFile.lowercased().hasSuffix(".msi") {
            if let msi = try? MSIReader.read(setupURL), let code = msi.productCode, let ver = msi.productVersion {
                msiInfo = IntuneWinMsiInfo(productCode: code, productVersion: ver)
            } else if !r.productCode.isEmpty {
                msiInfo = IntuneWinMsiInfo(productCode: r.productCode, productVersion: r.version)
            }
            log(msiInfo == nil ? "Could not read MSI details; Intune will not pre-fill the Program tab for this package." : "Embedded MSI product information for the Intune portal.")
        } else {
            log("EXE/MSIX packages carry no installer metadata: the Intune Program tab stays empty — paste the commands from commands.txt.")
        }
        let result = try await writer.create(sourceFolder: sourceFolder, setupFile: r.setupFile, applicationName: r.appName, outputFile: output, msiInfo: msiInfo)
        log("Created \(output.lastPathComponent) (\(result.sizeBytes) bytes) and verified its HMAC and contents.")

        let commands = folder.appendingPathComponent("commands.txt")
        try Self.commandsText(r).write(to: commands, atomically: true, encoding: .utf8)
        let info = folder.appendingPathComponent("package-info.json")
        let json: [String: Any] = [
            "app": r.appName, "version": r.version, "architecture": r.architecture.rawValue, "setupFile": r.setupFile,
            "installCommand": r.installCommand, "uninstallCommand": r.uninstallCommand, "productCode": r.productCode, "publisher": r.publisher,
            "sourceSha256": sourceHash, "package": output.lastPathComponent, "packageSha256": result.sha256,
            "packageSizeBytes": result.sizeBytes, "builtBy": "App Package Builder (native macOS writer)",
            "selfVerified": result.selfVerified, "windowsInstallationTested": false,
        ]
        try JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted, .sortedKeys]).write(to: info)
        var detectionFile: URL?
        if !r.productCode.isEmpty {
            let d = folder.appendingPathComponent("detection.ps1")
            try Self.detectionScript(productCode: r.productCode, minVersion: r.version).write(to: d, atomically: true, encoding: .utf8)
            detectionFile = d
        }
        return LocalInstallerOutcome(result: result, outputFolder: folder, commandsFile: commands, infoFile: info, detectionFile: detectionFile, sourceSHA256: sourceHash)
    }

    /// Intune "custom script" detection for an MSI: exits 0 with output only when the product code is installed at >= minVersion.
    static func detectionScript(productCode: String, minVersion: String) -> String {
        func q(_ s: String) -> String { "'" + s.replacingOccurrences(of: "'", with: "''") + "'" }
        return """
        # Detection — MSI product \(productCode) (minimum version \(minVersion))
        # Generated by App Package Builder. Not validated on Windows.
        $min = \(q(minVersion))
        function Test-MinVersion($found, $min) {
            if (-not $min) { return $true }
            try { return ([version]($found -replace '[^0-9.].*$','')) -ge ([version]($min -replace '[^0-9.].*$','')) } catch { return $true }
        }
        $roots = @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall')
        foreach ($root in $roots) {
            $key = Join-Path $root \(q(productCode))
            if (Test-Path -LiteralPath $key) {
                $v = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).DisplayVersion
                if (Test-MinVersion $v $min) { Write-Output 'Detected'; exit 0 }
            }
        }
        exit 1

        """
    }

    static func commandsText(_ r: LocalInstallerRequest) -> String {
        let detection = r.productCode.isEmpty
            ? "Detection: none generated. Add a detection rule in Intune (MSI product code, file or registry) before assigning."
            : "Detection (Intune → Detection rules → MSI): product code \(r.productCode), version >= \(r.version)\n(or use detection.ps1 as a custom script rule)"
        return """
        \(r.appName) \(r.version) (\(r.architecture.rawValue))

        Install command:
        \(r.installCommand)

        Uninstall command:
        \(r.uninstallCommand)

        \(detection)

        INTUNE: for an MSI package the portal pre-fills Program and Detection from the package. For EXE/MSIX packages it cannot,
        so paste the commands above into Intune → Program and add a detection rule yourself.

        NOTE: This package was built on macOS and has NOT been installed or tested on Windows.
        Validate install, detection and uninstall on a Windows test device and pilot before wider assignment.
        """
    }
}
