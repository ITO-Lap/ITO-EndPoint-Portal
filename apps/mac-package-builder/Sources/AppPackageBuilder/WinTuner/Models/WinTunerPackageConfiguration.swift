import Foundation

/// Adds an "Auto" choice on top of `WinGetInstallerType`'s six explicit
/// installer kinds, since the Configure phase lets the user defer to
/// whatever WinTuner/the manifest resolves by default (the script's
/// `--installer-type` flag is optional).
enum WinTunerInstallerTypeChoice: String, Codable, CaseIterable, Identifiable, Equatable {
    case auto
    case msi
    case exe
    case msix
    case msixBundle
    case appx
    case appxBundle

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .auto: return "Auto (recommended)"
        default: return explicitType?.displayName ?? rawValue
        }
    }

    /// The matching `WinGetInstallerType`, or `nil` for `.auto`.
    var explicitType: WinGetInstallerType? {
        switch self {
        case .auto: return nil
        case .msi: return .msi
        case .exe: return .exe
        case .msix: return .msix
        case .msixBundle: return .msixBundle
        case .appx: return .appx
        case .appxBundle: return .appxBundle
        }
    }

    /// The exact `--installer-type` token, or `nil` when `.auto` (in which
    /// case the flag is omitted entirely).
    var scriptValue: String? { explicitType?.scriptValue }
}

enum WinTunerConfigurationError: LocalizedError, Equatable {
    case emptyVersion
    case invalidOutputDirectory(String)

    var errorDescription: String? {
        switch self {
        case .emptyVersion:
            return "Version cannot be empty."
        case .invalidOutputDirectory(let path):
            return "\"\(path)\" is not a valid, safe output directory."
        }
    }
}

/// User-editable configuration for one WinGet Packager (Local) run. Mirrors
/// `PackageConfiguration`'s Codable + `validateStrictFields()` pattern.
///
/// All generation toggles default to `true` (produce the fullest, safest
/// package by default) except `downloadOriginalInstaller`, which also
/// defaults to `true` since it's required for hash verification and for
/// WinTuner's own `.intunewin` creation — there is no meaningful "skip the
/// download but still package" mode in this workflow.
struct WinTunerPackageConfiguration: Codable, Equatable {
    var version: String = ""
    var architecture: WinGetArchitecture = .x64
    var installerType: WinTunerInstallerTypeChoice = .auto
    var context: WinGetInstallScope = .machine
    var locale: String = ""
    var silentInstallerArguments: String = ""
    var outputDirectory: String = "~/Desktop/Packages/Windows"

    var downloadOriginalInstaller: Bool = true
    var createIntuneWin: Bool = true
    var generateInstallScript: Bool = true
    var generateUninstallScript: Bool = true
    var generateDetectScript: Bool = true
    var generateRequirementsScript: Bool = true
    var generatePackagingReport: Bool = true

    static func draft(packageId: String) -> WinTunerPackageConfiguration {
        WinTunerPackageConfiguration()
    }

    /// Throws `WinTunerConfigurationError` if a field that will be embedded
    /// in a script argument or filesystem path is malformed.
    func validateStrictFields() throws {
        guard !version.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw WinTunerConfigurationError.emptyVersion
        }
        do {
            _ = try PathValidator.canonicalize(outputDirectory)
        } catch {
            throw WinTunerConfigurationError.invalidOutputDirectory(outputDirectory)
        }
    }
}
