import Foundation
@testable import AppPackageBuilder

/// Scriptable stand-in for `RemoteBuildAgentServicing`, mirroring
/// `MockProcessRunner`'s style (see `PackageInspectorServiceTests.swift`):
/// every method returns a settable canned response, or throws a settable
/// canned error, so viewmodel/service tests can exercise every
/// `RemoteJobPhase` (disconnected, error, downloading, etc.) without a real
/// network call or a real Windows Build Agent.
final class MockBuildAgentClient: RemoteBuildAgentServicing {
    enum MockError: Error, Equatable {
        case generic(String)
    }

    // MARK: - Canned responses

    var healthResult: Result<WindowsAgentInfo, Error> = .success(
        WindowsAgentInfo(
            agentName: "mock-agent",
            windowsVersion: "10.0.19045",
            winGetVersion: "1.7.0",
            intuneWinAppUtilStatus: .available,
            lastHeartbeat: Date(),
            availableDiskSpaceBytes: 50_000_000_000
        )
    )

    var searchPackagesResult: Result<[WinGetPackage], Error> = .success([])
    var packageDetailResult: Result<WinGetPackageDetail, Error>?
    var submitDownloadJobResult: Result<WindowsBuildJob, Error>?
    var submitPackageJobResult: Result<WindowsBuildJob, Error>?
    var jobStatusResult: Result<WindowsBuildJob, Error>?
    var cancelJobResult: Result<Void, Error> = .success(())
    var fetchArtifactResult: Result<URL, Error>?

    /// Simulated network latency for `searchPackages`, keyed by the exact
    /// query string, applied before `searchPackagesResult` is consulted.
    /// Lets tests exercise `WinGetCatalogViewModel`'s debounce/cancellation
    /// behavior deterministically, the same way
    /// `HomebrewServiceSearchTests`/`NewPackageViewModelSearchTests`'
    /// `MockHomebrewService.delayByQuery` does for the macOS search flow.
    var searchDelayByQuery: [String: UInt64] = [:]
    var defaultSearchDelayNanoseconds: UInt64 = 0

    /// Per-call results for `jobStatus`, consumed in order (one per call, id
    /// ignored) so orchestration tests can script a phase sequence (e.g.
    /// downloading -> downloading -> completed) across repeated polls.
    /// When empty, `jobStatusResult` is used for every call instead.
    var jobStatusResultSequence: [Result<WindowsBuildJob, Error>] = []
    private var jobStatusCallIndex = 0

    // MARK: - Captured calls, for assertions in tests that use this mock

    private(set) var searchQueries: [(query: String, source: String?)] = []
    private(set) var packageDetailIds: [String] = []
    private(set) var cancelledJobIds: [UUID] = []
    private(set) var fetchedArtifacts: [(jobId: UUID, name: String)] = []
    private(set) var jobStatusCallCount = 0

    func health() async throws -> WindowsAgentInfo {
        try healthResult.get()
    }

    func searchPackages(query: String, source: String?) async throws -> [WinGetPackage] {
        searchQueries.append((query, source))
        let delay = searchDelayByQuery[query] ?? defaultSearchDelayNanoseconds
        if delay > 0 {
            try await Task.sleep(nanoseconds: delay)
        }
        return try searchPackagesResult.get()
    }

    func packageDetail(id: String) async throws -> WinGetPackageDetail {
        packageDetailIds.append(id)
        guard let packageDetailResult else {
            throw MockError.generic("packageDetailResult not configured")
        }
        return try packageDetailResult.get()
    }

    func submitDownloadJob(
        packageId: String,
        version: String,
        architecture: WinGetPackageDetail.Architecture,
        scope: WinGetPackageDetail.InstallerScope,
        locale: String?
    ) async throws -> WindowsBuildJob {
        guard let submitDownloadJobResult else {
            throw MockError.generic("submitDownloadJobResult not configured")
        }
        return try submitDownloadJobResult.get()
    }

    func submitPackageJob(
        configuration: WindowsPackageConfiguration,
        sourceJobId: UUID
    ) async throws -> WindowsBuildJob {
        guard let submitPackageJobResult else {
            throw MockError.generic("submitPackageJobResult not configured")
        }
        return try submitPackageJobResult.get()
    }

    func jobStatus(id: UUID) async throws -> WindowsBuildJob {
        jobStatusCallCount += 1
        if !jobStatusResultSequence.isEmpty {
            let index = min(jobStatusCallIndex, jobStatusResultSequence.count - 1)
            jobStatusCallIndex += 1
            return try jobStatusResultSequence[index].get()
        }
        guard let jobStatusResult else {
            throw MockError.generic("jobStatusResult not configured")
        }
        return try jobStatusResult.get()
    }

    func cancelJob(id: UUID) async throws {
        cancelledJobIds.append(id)
        try cancelJobResult.get()
    }

    func fetchArtifact(jobId: UUID, name: String) async throws -> URL {
        fetchedArtifacts.append((jobId, name))
        guard let fetchArtifactResult else {
            throw MockError.generic("fetchArtifactResult not configured")
        }
        return try fetchArtifactResult.get()
    }
}
