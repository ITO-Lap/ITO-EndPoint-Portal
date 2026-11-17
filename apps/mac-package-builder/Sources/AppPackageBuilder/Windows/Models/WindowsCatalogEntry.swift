import Foundation

/// One row in the persisted Windows package catalog (JSON under Application
/// Support, mirrors `BuildHistoryRecord`/`BuildHistoryService`'s pattern for
/// the macOS flow) — tracks what has been packaged, whether a newer WinGet
/// version is available, and its approval state.
struct WindowsCatalogEntry: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var winGetId: String
    var packagedVersion: String?
    var availableWinGetVersion: String?
    var lastChecked: Date?
    var lastPackaged: Date?
    var validationResult: WindowsValidationReport?
    var buildResult: WindowsBuildJob?
    var approvalState: ApprovalState = .pending

    /// Whether the catalog's most recently observed WinGet version is newer
    /// than what has actually been packaged. `false` whenever either version
    /// is unknown, so an incomplete entry never falsely claims to be current.
    var updateAvailable: Bool {
        guard let packagedVersion, let availableWinGetVersion else { return false }
        return packagedVersion != availableWinGetVersion
    }

    enum ApprovalState: String, Codable, CaseIterable, Identifiable {
        case pending
        case approved
        case rejected

        var id: String { rawValue }
        var displayName: String { rawValue.capitalized }
    }
}
