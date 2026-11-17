import Foundation

/// Failure cases for the Windows packaging job orchestration, mirroring
/// `PackageBuilderError`'s per-case, user-facing message style.
enum WindowsJobError: LocalizedError, Equatable {
    case cancelled
    case timedOut
    case jobFailed(String)

    var errorDescription: String? {
        switch self {
        case .cancelled:
            return "Job cancelled."
        case .timedOut:
            return "Timed out waiting for the Windows Build Agent to finish this job."
        case .jobFailed(let reason):
            return "Windows Build Agent job failed: \(reason)"
        }
    }
}

/// Orchestrates the Windows packaging wizard's agent-backed steps —
/// Download and Package — against `RemoteBuildAgentServicing`. "Select
/// Application"/"Select Version" are local user picks and never touch this
/// service; Validate/Test/Export are pure local rendering over the results
/// this service returns.
///
/// Mirrors `PackageBuilderService`'s shape: a `log` callback for
/// human-readable progress, an `isCancelled` callback plus
/// `Task.checkCancellation()` checked between polls, and cancellation that
/// actively notifies the agent (`cancelJob`) rather than just abandoning the
/// local `Task`.
final class WindowsPackageJobService {
    private let client: RemoteBuildAgentServicing
    private let pollInterval: TimeInterval
    private let timeout: TimeInterval

    init(
        client: RemoteBuildAgentServicing,
        pollInterval: TimeInterval = 1.0,
        timeout: TimeInterval = 30 * 60
    ) {
        self.client = client
        self.pollInterval = pollInterval
        self.timeout = timeout
    }

    /// Submits a download job for one WinGet package/version and polls until
    /// it reaches a terminal `RemoteJobPhase`.
    func download(
        packageId: String,
        version: String,
        architecture: WinGetPackageDetail.Architecture,
        scope: WinGetPackageDetail.InstallerScope,
        locale: String?,
        source: String = "winget",
        log: @escaping (String) -> Void,
        isCancelled: @escaping () -> Bool
    ) async throws -> WindowsBuildJob {
        log("Submitting download job for \(packageId) \(version)...")
        let job = try await client.submitDownloadJob(
            packageId: packageId,
            version: version,
            architecture: architecture,
            scope: scope,
            locale: locale,
            source: source
        )
        log("Download job \(job.id) submitted; waiting for agent...")
        return try await poll(jobId: job.id, log: log, isCancelled: isCancelled)
    }

    /// Submits an IntuneWin packaging job from a previously validated
    /// download job, and polls until it reaches a terminal `RemoteJobPhase`.
    func package(
        configuration: WindowsPackageConfiguration,
        sourceJobId: UUID,
        log: @escaping (String) -> Void,
        isCancelled: @escaping () -> Bool
    ) async throws -> WindowsBuildJob {
        try configuration.validateStrictFields()
        log("Submitting packaging job from source job \(sourceJobId)...")
        let job = try await client.submitPackageJob(configuration: configuration, sourceJobId: sourceJobId)
        log("Packaging job \(job.id) submitted; waiting for agent...")
        return try await poll(jobId: job.id, log: log, isCancelled: isCancelled)
    }

    /// Polls `jobStatus` on `pollInterval` until the job reaches a terminal
    /// phase, `timeout` elapses, or the caller cancels.
    private func poll(
        jobId: UUID,
        log: @escaping (String) -> Void,
        isCancelled: @escaping () -> Bool
    ) async throws -> WindowsBuildJob {
        let deadline = Date().addingTimeInterval(timeout)
        var lastPhase: RemoteJobPhase?
        var loggedLineCount = 0

        while true {
            try Task.checkCancellation()
            if isCancelled() {
                log("Cancelling job \(jobId)...")
                try? await client.cancelJob(id: jobId)
                throw WindowsJobError.cancelled
            }
            guard Date() < deadline else {
                try? await client.cancelJob(id: jobId)
                throw WindowsJobError.timedOut
            }

            let job = try await client.jobStatus(id: jobId)
            if job.phase != lastPhase {
                log("Job \(jobId): \(job.phase.title)")
                lastPhase = job.phase
            }
            if job.logLines.count > loggedLineCount {
                for line in job.logLines[loggedLineCount...] {
                    log(line)
                }
                loggedLineCount = job.logLines.count
            }

            switch job.phase {
            case .completed:
                return job
            case .failed(let reason):
                throw WindowsJobError.jobFailed(reason)
            case .cancelled:
                throw WindowsJobError.cancelled
            default:
                break
            }

            try Task.checkCancellation()
            if isCancelled() {
                log("Cancelling job \(jobId)...")
                try? await client.cancelJob(id: jobId)
                throw WindowsJobError.cancelled
            }

            try await Task.sleep(nanoseconds: UInt64(pollInterval * 1_000_000_000))
        }
    }
}
