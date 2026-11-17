import Foundation

/// Matches the script's `--architecture` values exactly: `x64`, `x86`,
/// `arm64`, `neutral`.
enum WinGetArchitecture: String, Codable, CaseIterable, Identifiable {
    case x64
    case x86
    case arm64
    case neutral

    var id: String { rawValue }

    /// The exact token expected by `--architecture`.
    var scriptValue: String { rawValue }

    var displayName: String {
        switch self {
        case .x64: return "x64"
        case .x86: return "x86"
        case .arm64: return "ARM64"
        case .neutral: return "Neutral"
        }
    }
}

/// Matches the script's `--context` values exactly: `System`/`User`.
enum WinGetInstallScope: String, Codable, CaseIterable, Identifiable {
    case machine
    case user

    var id: String { rawValue }

    /// The exact token expected by `--context`.
    var scriptValue: String {
        switch self {
        case .machine: return "System"
        case .user: return "User"
        }
    }

    var displayName: String {
        switch self {
        case .machine: return "System (machine-wide)"
        case .user: return "User"
        }
    }
}

/// Matches the script's `--installer-type` values exactly: `Msi`, `Exe`,
/// `Msix`, `MsixBundle`, `Appx`, `AppxBundle`.
enum WinGetInstallerType: String, Codable, CaseIterable, Identifiable {
    case msi
    case exe
    case msix
    case msixBundle
    case appx
    case appxBundle

    var id: String { rawValue }

    /// The exact token expected by `--installer-type`.
    var scriptValue: String {
        switch self {
        case .msi: return "Msi"
        case .exe: return "Exe"
        case .msix: return "Msix"
        case .msixBundle: return "MsixBundle"
        case .appx: return "Appx"
        case .appxBundle: return "AppxBundle"
        }
    }

    var displayName: String { scriptValue }

    /// Maps a WinGet manifest's `InstallerType` field (case-insensitive) to
    /// this enum, if recognized.
    init?(manifestValue: String) {
        switch manifestValue.lowercased() {
        case "msi", "wix", "burn": self = .msi
        case "exe", "nullsoft", "inno", "portable": self = .exe
        case "msix": self = .msix
        case "msixbundle": self = .msixBundle
        case "appx": self = .appx
        case "appxbundle": self = .appxBundle
        default: return nil
        }
    }
}

/// Resolved installer metadata for one WinGet package version, extracted
/// from the official `microsoft/winget-pkgs` installer (and, best-effort,
/// locale) manifest YAML. This is the sole source of truth for the hash and
/// silent-install/uninstall switches — never the optional discovery
/// provider.
struct WinGetInstallerManifest: Equatable {
    let packageId: String
    let version: String
    let installerURL: URL
    let installerType: WinGetInstallerType
    let architecture: WinGetArchitecture
    let scope: WinGetInstallScope?
    let sha256: String?
    let silentInstallSwitches: String?
    let silentUninstallSwitches: String?
    let upgradeCode: String?
    let productCode: String?
    let expectedOutputName: String?
    let locale: String?

    /// Human-readable names of any optional field the Review screen should
    /// flag as missing/unresolved metadata.
    var missingFields: [String] {
        var missing: [String] = []
        if sha256?.isEmpty ?? true { missing.append("SHA-256 hash") }
        if silentInstallSwitches?.isEmpty ?? true { missing.append("Silent install switches") }
        if upgradeCode?.isEmpty ?? true { missing.append("Upgrade code") }
        if productCode?.isEmpty ?? true { missing.append("Product code") }
        return missing
    }
}
