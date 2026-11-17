import Foundation

/// One unit of work submitted to the Windows Build Agent — either a WinGet
/// download or an IntuneWin packaging pass. `WindowsBuildJobsViewModel`
/// (added later) polls `RemoteBuildAgentServicing.jobStatus(id:)` and
/// re-renders from `phase` via the shared `RemoteJobPhase`.
struct WindowsBuildJob: Identifiable, Codable, Equatable {
    let id: UUID
    var kind: Kind
    var phase: RemoteJobPhase
    var createdAt: Date
    var updatedAt: Date

    var packageId: String
    var version: String
    var architecture: WinGetPackageDetail.Architecture
    var scope: WinGetPackageDetail.InstallerScope

    /// Rolling console-style output from the agent for this job, appended to
    /// as status polls come back — mirrors `BuildLogService`'s in-memory
    /// buffer for the macOS build flow.
    var logLines: [String] = []

    /// Populated only by the Windows agent after it has calculated the hash,
    /// checked Authenticode and (for MSI) read installer metadata.  Keeping
    /// this on the job means the Mac never pretends to validate a Windows
    /// installer locally.
    var validationReport: WindowsValidationReport?

    /// Names of safe, predefined artifacts available for download.  These
    /// are identifiers, never agent paths or arbitrary URLs.
    var artifacts: [String] = []

    enum Kind: String, Codable, CaseIterable, Identifiable {
        case download
        case package

        var id: String { rawValue }
        var displayName: String { self == .download ? "Download" : "Package" }
    }
}
