import Foundation

/// Everything the Mac app needs from a remote Windows Build Agent, exposed
/// as one seam. `winget`, PowerShell, Authenticode validation, and
/// `IntuneWinAppUtil.exe` only exist on Windows, so none of this can run
/// in-process on macOS — every call here is a network request to a
/// purpose-built agent.
///
/// Kept as a protocol (rather than calling a concrete `URLSession` client
/// directly) for the same reason `ProcessRunning` exists: every Mac-side
/// service that needs the agent depends on this protocol, not on
/// `WindowsBuildAgentClient`, so it is testable against `MockBuildAgentClient`
/// and so a second remote-build backend could be introduced later without
/// touching any call site.
protocol RemoteBuildAgentServicing {
    /// Checks agent reachability and reports its current health/readiness.
    func health() async throws -> WindowsAgentInfo

    /// Searches the agent's configured WinGet source(s) for packages
    /// matching `query`. `source` narrows to one source name, or searches
    /// all configured sources when `nil`.
    func searchPackages(query: String, source: String?) async throws -> [WinGetPackage]

    /// Fetches full manifest metadata (`winget show`) for one package ID.
    func packageDetail(id: String) async throws -> WinGetPackageDetail

    /// Submits a job to download and validate one installer on the agent.
    func submitDownloadJob(
        packageId: String,
        version: String,
        architecture: WinGetPackageDetail.Architecture,
        scope: WinGetPackageDetail.InstallerScope,
        locale: String?
    ) async throws -> WindowsBuildJob

    /// Submits a job to build an `.intunewin` package from a prior,
    /// validated download job.
    func submitPackageJob(
        configuration: WindowsPackageConfiguration,
        sourceJobId: UUID
    ) async throws -> WindowsBuildJob

    /// Polls the current status of a previously submitted job.
    func jobStatus(id: UUID) async throws -> WindowsBuildJob

    /// Requests cancellation of an in-flight job.
    func cancelJob(id: UUID) async throws -> Void

    /// Downloads a named artifact produced by a completed job to a local
    /// temporary file and returns its URL.
    func fetchArtifact(jobId: UUID, name: String) async throws -> URL
}

extension RemoteBuildAgentServicing {
    /// Source-aware download capability. Older agents continue to work with
    /// the Community source only; the HTTPS client overrides this to send the
    /// constrained source name to current agents.
    func submitDownloadJob(
        packageId: String,
        version: String,
        architecture: WinGetPackageDetail.Architecture,
        scope: WinGetPackageDetail.InstallerScope,
        locale: String?,
        source: String
    ) async throws -> WindowsBuildJob {
        try await submitDownloadJob(packageId: packageId, version: version, architecture: architecture, scope: scope, locale: locale)
    }
}
