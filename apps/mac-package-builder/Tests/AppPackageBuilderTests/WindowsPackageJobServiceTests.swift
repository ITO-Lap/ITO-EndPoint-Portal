import XCTest
@testable import AppPackageBuilder

/// Orchestration tests for `WindowsPackageJobService` against
/// `MockBuildAgentClient`, mirroring `PackageInspectorServiceTests`'
/// mock-driven style: happy-path polling to a terminal phase, cancellation
/// calling `client.cancelJob`, and timeout mapping to `WindowsJobError.timedOut`.
final class WindowsPackageJobServiceTests: XCTestCase {

    private func makeJob(id: UUID = UUID(), phase: RemoteJobPhase, kind: WindowsBuildJob.Kind = .download) -> WindowsBuildJob {
        WindowsBuildJob(
            id: id,
            kind: kind,
            phase: phase,
            createdAt: Date(),
            updatedAt: Date(),
            packageId: "Microsoft.VisualStudioCode",
            version: "1.94.2",
            architecture: .x64,
            scope: .machine,
            logLines: []
        )
    }

    // MARK: - Happy path

    func testDownloadPollsUntilCompletedPhase() async throws {
        let mock = MockBuildAgentClient()
        let jobId = UUID()
        mock.submitDownloadJobResult = .success(makeJob(id: jobId, phase: .downloading(progress: 0.1)))
        mock.jobStatusResultSequence = [
            .success(makeJob(id: jobId, phase: .downloading(progress: 0.5))),
            .success(makeJob(id: jobId, phase: .validating)),
            .success(makeJob(id: jobId, phase: .completed)),
        ]
        let service = WindowsPackageJobService(client: mock, pollInterval: 0.01, timeout: 5)

        var loggedLines: [String] = []
        let job = try await service.download(
            packageId: "Microsoft.VisualStudioCode",
            version: "1.94.2",
            architecture: .x64,
            scope: .machine,
            locale: "en-US",
            log: { loggedLines.append($0) },
            isCancelled: { false }
        )

        XCTAssertEqual(job.phase, .completed)
        XCTAssertEqual(mock.jobStatusCallCount, 3)
        XCTAssertTrue(loggedLines.contains { $0.contains("submitted") })
    }

    func testPackageValidatesConfigurationBeforeSubmitting() async throws {
        let mock = MockBuildAgentClient()
        let jobId = UUID()
        mock.submitPackageJobResult = .success(makeJob(id: jobId, phase: .packaging, kind: .package))
        mock.jobStatusResultSequence = [.success(makeJob(id: jobId, phase: .completed, kind: .package))]
        let service = WindowsPackageJobService(client: mock, pollInterval: 0.01, timeout: 5)

        var configuration = WindowsPackageConfiguration.draft()
        configuration.installCommand = "msiexec /i app.msi /qn"
        configuration.uninstallCommand = "msiexec /x app.msi /qn"

        let job = try await service.package(
            configuration: configuration,
            sourceJobId: UUID(),
            log: { _ in },
            isCancelled: { false }
        )

        XCTAssertEqual(job.phase, .completed)
    }

    func testPackageRejectsInvalidConfigurationWithoutSubmitting() async {
        let mock = MockBuildAgentClient()
        let service = WindowsPackageJobService(client: mock, pollInterval: 0.01, timeout: 5)

        // Draft configuration has empty install/uninstall commands, which
        // `validateStrictFields()` rejects before any network call is made.
        let configuration = WindowsPackageConfiguration.draft()

        do {
            _ = try await service.package(
                configuration: configuration,
                sourceJobId: UUID(),
                log: { _ in },
                isCancelled: { false }
            )
            XCTFail("expected validation to throw before submitting")
        } catch is WindowsPackageConfigurationError {
            // expected
        } catch {
            XCTFail("expected WindowsPackageConfigurationError, got \(error)")
        }
        XCTAssertEqual(mock.jobStatusCallCount, 0)
    }

    // MARK: - Job failure

    func testJobFailedPhaseThrowsJobFailedError() async {
        let mock = MockBuildAgentClient()
        let jobId = UUID()
        mock.submitDownloadJobResult = .success(makeJob(id: jobId, phase: .downloading(progress: 0.1)))
        mock.jobStatusResultSequence = [.success(makeJob(id: jobId, phase: .failed("hash mismatch")))]
        let service = WindowsPackageJobService(client: mock, pollInterval: 0.01, timeout: 5)

        do {
            _ = try await service.download(
                packageId: "id", version: "1.0", architecture: .x64, scope: .machine, locale: nil,
                log: { _ in }, isCancelled: { false }
            )
            XCTFail("expected WindowsJobError.jobFailed")
        } catch WindowsJobError.jobFailed(let reason) {
            XCTAssertEqual(reason, "hash mismatch")
        } catch {
            XCTFail("expected WindowsJobError.jobFailed, got \(error)")
        }
    }

    // MARK: - Cancellation

    func testCancellationCallsClientCancelJobAndThrowsCancelled() async {
        let mock = MockBuildAgentClient()
        let jobId = UUID()
        mock.submitDownloadJobResult = .success(makeJob(id: jobId, phase: .downloading(progress: 0.1)))
        // Never resolves on its own — cancellation must be what ends the poll.
        mock.jobStatusResultSequence = [.success(makeJob(id: jobId, phase: .downloading(progress: 0.2)))]
        let service = WindowsPackageJobService(client: mock, pollInterval: 0.01, timeout: 5)

        do {
            _ = try await service.download(
                packageId: "id", version: "1.0", architecture: .x64, scope: .machine, locale: nil,
                log: { _ in }, isCancelled: { true }
            )
            XCTFail("expected WindowsJobError.cancelled")
        } catch WindowsJobError.cancelled {
            // expected
        } catch {
            XCTFail("expected WindowsJobError.cancelled, got \(error)")
        }
        XCTAssertEqual(mock.cancelledJobIds, [jobId])
    }

    func testAgentReportedCancelledPhaseThrowsCancelled() async {
        let mock = MockBuildAgentClient()
        let jobId = UUID()
        mock.submitDownloadJobResult = .success(makeJob(id: jobId, phase: .downloading(progress: 0.1)))
        mock.jobStatusResultSequence = [.success(makeJob(id: jobId, phase: .cancelled))]
        let service = WindowsPackageJobService(client: mock, pollInterval: 0.01, timeout: 5)

        do {
            _ = try await service.download(
                packageId: "id", version: "1.0", architecture: .x64, scope: .machine, locale: nil,
                log: { _ in }, isCancelled: { false }
            )
            XCTFail("expected WindowsJobError.cancelled")
        } catch WindowsJobError.cancelled {
            // expected
        } catch {
            XCTFail("expected WindowsJobError.cancelled, got \(error)")
        }
    }

    // MARK: - Timeout

    func testTimeoutMapsToTimedOutAndCancelsTheJob() async {
        let mock = MockBuildAgentClient()
        let jobId = UUID()
        mock.submitDownloadJobResult = .success(makeJob(id: jobId, phase: .downloading(progress: 0.1)))
        // Always reports a non-terminal phase, so only the timeout can end this.
        mock.jobStatusResult = .success(makeJob(id: jobId, phase: .downloading(progress: 0.3)))
        // Short poll interval and near-zero timeout so this test runs fast.
        let service = WindowsPackageJobService(client: mock, pollInterval: 0.01, timeout: 0.03)

        do {
            _ = try await service.download(
                packageId: "id", version: "1.0", architecture: .x64, scope: .machine, locale: nil,
                log: { _ in }, isCancelled: { false }
            )
            XCTFail("expected WindowsJobError.timedOut")
        } catch WindowsJobError.timedOut {
            // expected
        } catch {
            XCTFail("expected WindowsJobError.timedOut, got \(error)")
        }
        XCTAssertEqual(mock.cancelledJobIds, [jobId])
    }
}
