import Foundation

enum LocalInstallerKind: String, CaseIterable, Equatable {
    case msi, exe, msix, appx
    static func kind(for url: URL) -> LocalInstallerKind? { LocalInstallerKind(rawValue: url.pathExtension.lowercased()) }
}

enum LocalArchitecture: String, CaseIterable, Identifiable, Equatable {
    case x64, x86, arm64
    var id: String { rawValue }
}

enum LocalCommandConfidence: Equatable {
    case verified, likely, unknown
    var label: String {
        switch self {
        case .verified: return "Verified"
        case .likely: return "Likely — test required"
        case .unknown: return "Unknown — enter the command manually"
        }
    }
}

enum LocalInstallerTech: String, Equatable { case msi, msix, innoSetup, nsis, wixBurn, unknown }

struct LocalInstallerGuess: Equatable {
    var kind: LocalInstallerKind
    var tech: LocalInstallerTech
    var appName: String
    var version: String
    var architecture: LocalArchitecture
    var installCommand: String
    var uninstallCommand: String
    var confidence: LocalCommandConfidence
    var note: String
    /// MSI only — read from the file's own Property table.
    var productCode: String = ""
    var upgradeCode: String = ""
    var publisher: String = ""
}

/// Read-only guesses from the file name and (for EXEs) a bounded scan of the file's bytes. Nothing is executed, and
/// nothing is presented as fact that was only inferred: the UI shows `confidence` and `note` next to every suggestion.
enum LocalInstallerInspector {
    static func architecture(fromFileName name: String) -> LocalArchitecture? {
        let n = name.lowercased()
        func has(_ p: String) -> Bool { n.range(of: "(^|[^a-z0-9])(\(p))([^a-z0-9]|$)", options: .regularExpression) != nil }
        if has("arm64|aarch64") { return .arm64 }
        if has("x64|amd64|x86[-_]64|win64") { return .x64 }
        if has("x86|win32|ia32|i386") { return .x86 }
        return nil
    }

    static func version(fromFileName name: String) -> String? {
        guard let r = name.range(of: "\\d+(\\.\\d+){1,3}", options: .regularExpression) else { return nil }
        return String(name[r])
    }

    static func appName(fromFileName name: String) -> String {
        var stem = (name as NSString).deletingPathExtension
        for pattern in ["\\d+(\\.\\d+){1,3}", "(?i)(^|[^a-z0-9])(x64|x86|amd64|arm64|win64|win32|setup|installer|install)(?=[^a-z0-9]|$)"] {
            stem = stem.replacingOccurrences(of: pattern, with: " ", options: .regularExpression)
        }
        let cleaned = stem.replacingOccurrences(of: "[-_.]+", with: " ", options: .regularExpression)
            .split(separator: " ").joined(separator: " ").trimmingCharacters(in: .whitespaces)
        return cleaned.isEmpty ? (name as NSString).deletingPathExtension : cleaned
    }

    private static let markers: [(LocalInstallerTech, Data)] = [
        (.innoSetup, Data("Inno Setup Setup Data".utf8)),
        (.nsis, Data([0xEF, 0xBE, 0xAD, 0xDE, 0x4E, 0x75, 0x6C, 0x6C, 0x73, 0x6F, 0x66, 0x74, 0x49, 0x6E, 0x73, 0x74])),
        (.nsis, Data("Nullsoft Install System".utf8)),
        (.wixBurn, Data(".wixburn".utf8)),
    ]

    /// Scans up to 64 MB in 4 MB windows for installer-technology markers.
    static func detectTech(of url: URL) -> LocalInstallerTech {
        guard let h = try? FileHandle(forReadingFrom: url) else { return .unknown }
        defer { try? h.close() }
        let window = 4 * 1024 * 1024, overlap = 64
        var carry = Data(); var scanned = 0
        while scanned < 64 * 1024 * 1024, let d = try? h.read(upToCount: window), !d.isEmpty {
            let buf = carry + d
            for (tech, needle) in markers where buf.range(of: needle) != nil { return tech }
            carry = buf.suffix(overlap); scanned += d.count
        }
        return .unknown
    }

    static func inspect(_ url: URL) -> LocalInstallerGuess? {
        guard let kind = LocalInstallerKind.kind(for: url) else { return nil }
        let name = url.lastPathComponent, q = "\"\(name)\""
        let base = (
            appName: appName(fromFileName: name), version: version(fromFileName: name) ?? "",
            arch: architecture(fromFileName: name) ?? .x64
        )
        switch kind {
        case .msi:
            // Everything an MSI knows about itself is stored in its own database; read it instead of guessing from the file name.
            let msi = try? MSIReader.read(url)
            let code = msi?.productCode ?? ""
            let readNote = code.isEmpty
                ? "Could not read the ProductCode from this MSI, so the uninstall command and detection rule need manual entry."
                : "ProductCode, version, publisher and architecture were read from the MSI itself."
            return LocalInstallerGuess(kind: kind, tech: .msi, appName: msi?.productName ?? base.appName, version: msi?.productVersion ?? base.version,
                architecture: msi?.architecture ?? base.arch, installCommand: "msiexec /i \(q) /qn /norestart",
                uninstallCommand: code.isEmpty ? "" : "msiexec /x \"\(code)\" /qn /norestart",
                confidence: code.isEmpty ? .likely : .verified, note: readNote,
                productCode: code, upgradeCode: msi?.upgradeCode ?? "", publisher: msi?.manufacturer ?? "")
        case .msix, .appx:
            return LocalInstallerGuess(kind: kind, tech: .msix, appName: base.appName, version: base.version, architecture: base.arch,
                installCommand: "powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\install.ps1",
                uninstallCommand: "powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\uninstall.ps1",
                confidence: .likely, note: "MSIX/AppX needs wrapper scripts (Add-AppxPackage); none are generated here, so add install.ps1/uninstall.ps1 to the folder or enter your own commands.")
        case .exe:
            let tech = detectTech(of: url)
            switch tech {
            case .innoSetup:
                return LocalInstallerGuess(kind: kind, tech: tech, appName: base.appName, version: base.version, architecture: base.arch,
                    installCommand: "\(q) /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-", uninstallCommand: "",
                    confidence: .likely, note: "Inno Setup marker found. Uninstall is unins000.exe in the install folder — enter its full path after a test install.")
            case .nsis:
                return LocalInstallerGuess(kind: kind, tech: tech, appName: base.appName, version: base.version, architecture: base.arch,
                    installCommand: "\(q) /S", uninstallCommand: "",
                    confidence: .likely, note: "NSIS marker found. The uninstaller path is application-specific — enter it after a test install.")
            case .wixBurn:
                return LocalInstallerGuess(kind: kind, tech: tech, appName: base.appName, version: base.version, architecture: base.arch,
                    installCommand: "\(q) /quiet /norestart", uninstallCommand: "\(q) /uninstall /quiet /norestart",
                    confidence: .likely, note: "WiX Burn bundle marker found.")
            default:
                return LocalInstallerGuess(kind: kind, tech: .unknown, appName: base.appName, version: base.version, architecture: base.arch,
                    installCommand: "", uninstallCommand: "",
                    confidence: .unknown, note: "Installer technology not recognised. No command is guessed — enter the vendor-documented silent install and uninstall commands.")
            }
        }
    }
}
