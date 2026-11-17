import Foundation

enum PackagingMode: String, Codable, CaseIterable, Identifiable {
    case enterprisePayload
    case onlineInstaller

    var id: String { rawValue }

    var displayName: String {
        self == .enterprisePayload ? "Enterprise Payload" : "Online Installer"
    }

    var explanation: String {
        switch self {
        case .enterprisePayload:
            return "Download, package, and include the application in the PKG installer. Recommended: works with no internet access on the target Mac."
        case .onlineInstaller:
            return "Create a lightweight PKG that installs Homebrew (if needed) and downloads the application during installation. Requires internet access on the target Mac."
        }
    }
}

/// The complete, user-editable configuration for one package build. Everything
/// here is either a validated primitive or a selection from a closed enum —
/// nothing free-form gets used in a shell command without passing through
/// `Validators` first.
struct PackageConfiguration: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var applicationName: String
    var homebrewToken: String
    var packageKind: PackageKind
    var packagingMode: PackagingMode = .enterprisePayload

    var requiredVersion: String = "latest"
    var architecture: PackageArchitecture = .automatic
    var packageIdentifier: String
    var packageVersion: String = "1.0"
    var outputDirectory: String = "~/Desktop/Packages"
    var minimumMacOSVersion: String = "14.0"
    var overwriteExisting: Bool = false

    var generateUninstaller: Bool = true
    var createDetectionScript: Bool = true
    var signPackage: Bool = false
    var notarizePackage: Bool = false
    var startHomebrewService: Bool = false
    var detailedLogging: Bool = false
    var upgradeExisting: Bool = true

    var signingIdentity: String? = nil
    var notarizationKeychainProfile: String? = nil

    static func draft() -> PackageConfiguration {
        PackageConfiguration(
            applicationName: "",
            homebrewToken: "",
            packageKind: .cask,
            packageIdentifier: "com.VERMA."
        )
    }

    /// Throws `ValidationError` if any field that will be embedded in a script,
    /// plist, or filesystem path is malformed.
    func validateStrictFields() throws {
        _ = try Validators.validateToken(homebrewToken)
        _ = try Validators.validateIdentifier(packageIdentifier)
        _ = try Validators.validateVersion(packageVersion)
        if requiredVersion != "latest" {
            _ = try Validators.validateVersion(requiredVersion)
        }
        _ = try PathValidator.canonicalize(outputDirectory)
    }
}
