import Foundation

/// Thrown by `WindowsPackageConfiguration.validateStrictFields()` when a
/// field that will be embedded in a generated script, detection rule, or
/// sent to the Windows Build Agent is malformed.
enum WindowsPackageConfigurationError: LocalizedError, Equatable {
    case invalidInstallCommand
    case invalidUninstallCommand
    case invalidMinimumWindowsVersion(String)
    case invalidDependency(String)
    case invalidSupersedes(String)

    var errorDescription: String? {
        switch self {
        case .invalidInstallCommand:
            return "The install command must not be empty."
        case .invalidUninstallCommand:
            return "The uninstall command must not be empty."
        case .invalidMinimumWindowsVersion(let v):
            return "\"\(v)\" is not a valid minimum Windows version."
        case .invalidDependency(let v):
            return "\"\(v)\" is not a valid dependency package ID."
        case .invalidSupersedes(let v):
            return "\"\(v)\" is not a valid superseded package ID."
        }
    }
}

/// The complete, admin-reviewable configuration for one Windows package build
/// — install/uninstall commands, detection logic, requirements, and
/// supersedence. Mirrors `PackageConfiguration.swift`'s Codable +
/// validate-before-use convention on the macOS side.
struct WindowsPackageConfiguration: Codable, Identifiable, Equatable {
    var id: UUID = UUID()

    var installCommand: String
    var uninstallCommand: String
    var installContext: InstallContext = .system
    var restartBehavior: RestartBehavior = .basedOnExitCode
    var returnCodes: [Int: String] = [
        0: "Success",
        1707: "Success",
        3010: "Soft Reboot",
        1641: "Hard Reboot",
        1618: "Retry",
    ]
    var detectionRules: [DetectionRule] = []
    var requirements: [String] = []
    var dependencies: [String] = []
    var supersedes: [String] = []
    var minimumWindowsVersion: String = "10.0.19041"
    var architecture: WinGetPackageDetail.Architecture = .x64
    /// Closed set of deployment systems requested for this job. The agent
    /// receives this as data and chooses only its predefined package actions;
    /// it is never an executable command or arbitrary destination.
    var deploymentTargets: [String] = []

    /// Where the installer runs relative to the logged-in user.
    enum InstallContext: String, Codable, CaseIterable, Identifiable {
        case system
        case user

        var id: String { rawValue }
        var displayName: String { self == .system ? "System" : "User" }
    }

    /// How the deployment tool should react after install/uninstall.
    enum RestartBehavior: String, Codable, CaseIterable, Identifiable {
        case basedOnExitCode
        case suppress
        case force

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .basedOnExitCode: return "Determine Based on Return Codes"
            case .suppress: return "No Specific Action"
            case .force: return "Force Restart"
            }
        }
    }

    static func draft() -> WindowsPackageConfiguration {
        WindowsPackageConfiguration(installCommand: "", uninstallCommand: "")
    }

    /// Throws `WindowsPackageConfigurationError` if any field that will be
    /// embedded in a generated script or sent to the agent is malformed.
    /// Command text itself is not shell-validated here (it is authored text
    /// destined for a PowerShell script file, not a `Process` argument
    /// array) — see `docs/SECURITY.md`'s injection model for the rationale
    /// behind treating those two cases differently.
    func validateStrictFields() throws {
        guard !installCommand.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw WindowsPackageConfigurationError.invalidInstallCommand
        }
        guard !uninstallCommand.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw WindowsPackageConfigurationError.invalidUninstallCommand
        }
        guard WinGetValidators.isValidVersion(minimumWindowsVersion) else {
            throw WindowsPackageConfigurationError.invalidMinimumWindowsVersion(minimumWindowsVersion)
        }
        for dependency in dependencies where !WinGetValidators.isValidPackageId(dependency) {
            throw WindowsPackageConfigurationError.invalidDependency(dependency)
        }
        for superseded in supersedes where !WinGetValidators.isValidPackageId(superseded) {
            throw WindowsPackageConfigurationError.invalidSupersedes(superseded)
        }
    }
}
