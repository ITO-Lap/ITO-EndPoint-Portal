import XCTest
@testable import AppPackageBuilder

/// Captures whatever `executablePath`/`arguments` `WinTunerCommandRunner`
/// passes through `ProcessRunning`, mirroring the `MockProcessRunner` idiom
/// from `PackageInspectorServiceTests.swift`/`AppInspectionServiceTests.swift`
/// — a settable canned `ProcessOutput`, plus an optional artificial delay so
/// cancellation-mid-run can be exercised deterministically.
private final class MockProcessRunner: ProcessRunning {
    var output = ProcessOutput(exitCode: 0, stdout: "", stderr: "")
    var delayNanoseconds: UInt64 = 0
    var linesToEmit: [String] = []

    private(set) var callCount = 0
    private(set) var capturedExecutablePaths: [String] = []
    private(set) var capturedArgumentLists: [[String]] = []

    var capturedExecutablePath: String? { capturedExecutablePaths.last }
    var capturedArguments: [String]? { capturedArgumentLists.last }

    func run(
        _ executablePath: String,
        arguments: [String],
        currentDirectory: URL?,
        environment: [String: String]?,
        onOutputLine: (@Sendable (String) -> Void)?
    ) async throws -> ProcessOutput {
        callCount += 1
        capturedExecutablePaths.append(executablePath)
        capturedArgumentLists.append(arguments)
        if delayNanoseconds > 0 {
            try await Task.sleep(nanoseconds: delayNanoseconds)
        }
        for line in linesToEmit {
            onOutputLine?(line)
        }
        return output
    }
}

private final class FakeInstallerDownloader: WinGetInstallerDownloading {
    private(set) var callCount = 0
    private(set) var downloadedFiles: [URL] = []

    func downloadInstaller(
        manifest: WinGetInstallerManifest,
        applicationName: String?,
        to directory: URL
    ) async throws -> WinGetInstallerDownloadResult {
        callCount += 1
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let fileName = WinTunerOutputNaming.sanitizedFileName(
            applicationName: applicationName ?? manifest.packageId,
            version: manifest.version,
            architecture: manifest.architecture.scriptValue,
            fileExtension: manifest.installerURL.pathExtension
        )
        let fileURL = WinTunerOutputNaming.nextAvailableURL(for: directory.appendingPathComponent(fileName))
        try Data("installer payload".utf8).write(to: fileURL)
        downloadedFiles.append(fileURL)
        return WinGetInstallerDownloadResult(fileURL: fileURL, sha256Verified: true)
    }
}

final class WinTunerCommandRunnerTests: XCTestCase {

    /// A fake path, never actually executed since `MockProcessRunner`
    /// intercepts every call — only used so `scriptURLOverride` has a
    /// deterministic, assertable value.
    private let fakeScriptURL = URL(fileURLWithPath: "/fake/bundle/Scripts/setup-winget-packager-macos.sh")

    private func makeRunner(
        _ mock: MockProcessRunner,
        installerDownloader: WinGetInstallerDownloading = FakeInstallerDownloader()
    ) -> WinTunerCommandRunner {
        WinTunerCommandRunner(
            processRunner: mock,
            scriptURLOverride: fakeScriptURL,
            installerDownloader: installerDownloader
        )
    }

    private func makeManifest(packageId: String = "7zip.7zip") -> WinGetInstallerManifest {
        WinGetInstallerManifest(
            packageId: packageId,
            version: "23.01",
            installerURL: URL(string: "https://example.com/7zip.exe")!,
            installerType: .exe,
            architecture: .x64,
            scope: .machine,
            sha256: "abc123",
            silentInstallSwitches: "/S",
            silentUninstallSwitches: nil,
            upgradeCode: nil,
            productCode: nil,
            expectedOutputName: "7-Zip",
            locale: "en-US"
        )
    }

    private func makeConfiguration() -> WinTunerPackageConfiguration {
        var configuration = WinTunerPackageConfiguration()
        configuration.version = "23.01"
        configuration.architecture = .x64
        configuration.context = .machine
        configuration.outputDirectory = "/tmp/WinGetPackages"
        return configuration
    }

    // MARK: checkDependencies

    func testCheckDependenciesBuildsExactArgv() async throws {
        let mock = MockProcessRunner()
        mock.output = ProcessOutput(
            exitCode: 0,
            stdout: #"{"macOS":true,"homebrew":true,"powershell":true,"winTuner":true,"powershellVersion":"7.6.6","winTunerVersion":"1.4.1","ready":true}"#,
            stderr: ""
        )
        let runner = makeRunner(mock)

        _ = try await runner.checkDependencies()

        XCTAssertEqual(mock.capturedExecutablePath, "/bin/bash")
        XCTAssertEqual(mock.capturedArguments, [fakeScriptURL.path, "check", "--json"])
    }

    func testCheckDependenciesDecodesCannedJSONStdout() async throws {
        let mock = MockProcessRunner()
        mock.output = ProcessOutput(
            exitCode: 0,
            stdout: #"{"macOS":true,"homebrew":true,"powershell":true,"winTuner":true,"powershellVersion":"7.6.6","winTunerVersion":"1.4.1","ready":true}"#,
            stderr: ""
        )
        let runner = makeRunner(mock)

        let status = try await runner.checkDependencies()

        XCTAssertEqual(status, DependencyStatus(
            macOS: true,
            homebrew: true,
            powershell: true,
            winTuner: true,
            powershellVersion: "7.6.6",
            winTunerVersion: "1.4.1",
            ready: true
        ))
    }

    // MARK: package argv shape

    func testPackageBuildsExactArgvWithAllOptionalFlags() async throws {
        let mock = MockProcessRunner()
        mock.output = ProcessOutput(exitCode: 0, stdout: "", stderr: "")
        let runner = makeRunner(mock)

        var configuration = makeConfiguration()
        configuration.installerType = .msi
        configuration.locale = "en-US"
        configuration.silentInstallerArguments = "/quiet /norestart"

        _ = try await runner.package(
            configuration: configuration,
            manifest: makeManifest(),
            log: { _ in },
            isCancelled: { false }
        )

        XCTAssertEqual(mock.capturedExecutablePath, "/bin/bash")
        XCTAssertEqual(mock.capturedArguments, [
            fakeScriptURL.path, "package",
            "--package-id", "7zip.7zip",
            "--output", "/tmp/WinGetPackages/7-Zip",
            "--version", "23.01",
            "--architecture", "x64",
            "--context", "System",
            "--installer-type", "Msi",
            "--locale", "en-US",
            "--installer-arguments", "/quiet /norestart"
        ])
    }

    func testPackageOmitsOptionalFlagsWhenNotSet() async throws {
        let mock = MockProcessRunner()
        mock.output = ProcessOutput(exitCode: 0, stdout: "", stderr: "")
        let runner = makeRunner(mock)

        // Default configuration: installerType == .auto, empty locale, empty
        // silent installer arguments — none of those three flags should appear.
        let configuration = makeConfiguration()

        _ = try await runner.package(
            configuration: configuration,
            manifest: makeManifest(),
            log: { _ in },
            isCancelled: { false }
        )

        XCTAssertEqual(mock.capturedArguments, [
            fakeScriptURL.path, "package",
            "--package-id", "7zip.7zip",
            "--output", "/tmp/WinGetPackages/7-Zip",
            "--version", "23.01",
            "--architecture", "x64",
            "--context", "System",
            "--installer-type", "Exe"
        ])
    }

    func testPackageCreatesExpandedApplicationOutputDirectoryBeforeLaunchingBridge() async throws {
        let mock = MockProcessRunner()
        let runner = makeRunner(mock)
        let baseDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("WinTunerRunner-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: baseDirectory) }

        var configuration = makeConfiguration()
        configuration.outputDirectory = baseDirectory.path

        _ = try await runner.package(
            configuration: configuration,
            manifest: makeManifest(),
            log: { _ in },
            isCancelled: { false }
        )

        let expectedOutputDirectory = baseDirectory.appendingPathComponent("7-Zip", isDirectory: true)
        XCTAssertTrue(FileManager.default.fileExists(atPath: expectedOutputDirectory.path))
        let arguments = try XCTUnwrap(mock.capturedArguments)
        let outputIndex = try XCTUnwrap(arguments.firstIndex(of: "--output"))
        XCTAssertEqual(arguments[outputIndex + 1], expectedOutputDirectory.path)
    }

    func testPackageSavesDownloadedInstallerBesideIntunePackageAndReportsIt() async throws {
        let mock = MockProcessRunner()
        let downloader = FakeInstallerDownloader()
        let runner = makeRunner(mock, installerDownloader: downloader)
        let baseDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("WinTunerInstaller-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: baseDirectory) }

        var configuration = makeConfiguration()
        configuration.outputDirectory = baseDirectory.path
        let manifest = makeManifest()

        let result = try await runner.package(
            configuration: configuration,
            manifest: manifest,
            log: { _ in },
            isCancelled: { false }
        )

        let expectedDirectory = baseDirectory.appendingPathComponent("7-Zip", isDirectory: true)
        let expectedInstaller = expectedDirectory.appendingPathComponent("7-Zip-23.01-x64.exe")
        XCTAssertEqual(downloader.callCount, 1)
        XCTAssertTrue(FileManager.default.fileExists(atPath: expectedInstaller.path))
        XCTAssertTrue(result.outputFileURLs.contains(expectedInstaller))
        XCTAssertTrue(result.installerDownloaded)
        XCTAssertTrue(result.sha256Verified)
    }

    func testPackageSkipsInstallerDownloadWhenDisabled() async throws {
        let mock = MockProcessRunner()
        let downloader = FakeInstallerDownloader()
        let runner = makeRunner(mock, installerDownloader: downloader)
        var configuration = makeConfiguration()
        configuration.downloadOriginalInstaller = false

        let result = try await runner.package(
            configuration: configuration,
            manifest: makeManifest(),
            log: { _ in },
            isCancelled: { false }
        )

        XCTAssertEqual(downloader.callCount, 0)
        XCTAssertFalse(result.installerDownloaded)
        XCTAssertFalse(result.sha256Verified)
    }

    // MARK: non-zero exit code

    func testNonZeroExitCodeThrowsCommandFailedRatherThanReturningSuccess() async {
        let mock = MockProcessRunner()
        mock.output = ProcessOutput(exitCode: 1, stdout: "", stderr: "something went wrong")
        let runner = makeRunner(mock)

        do {
            _ = try await runner.package(
                configuration: makeConfiguration(),
                manifest: makeManifest(),
                log: { _ in },
                isCancelled: { false }
            )
            XCTFail("expected commandFailed to be thrown")
        } catch WinTunerCommandRunnerError.commandFailed(let exitCode, let stderr) {
            XCTAssertEqual(exitCode, 1)
            XCTAssertTrue(stderr.contains("something went wrong"))
        } catch {
            XCTFail("expected WinTunerCommandRunnerError.commandFailed, got \(error)")
        }
    }

    func testCheckDependenciesNonZeroNonTwoExitCodeThrowsCommandFailed() async {
        let mock = MockProcessRunner()
        mock.output = ProcessOutput(exitCode: 127, stdout: "", stderr: "bash: pwsh: command not found")
        let runner = makeRunner(mock)

        do {
            _ = try await runner.checkDependencies()
            XCTFail("expected commandFailed to be thrown")
        } catch WinTunerCommandRunnerError.commandFailed(let exitCode, _) {
            XCTAssertEqual(exitCode, 127)
        } catch {
            XCTFail("expected WinTunerCommandRunnerError.commandFailed, got \(error)")
        }
    }

    // MARK: cancellation

    func testCancellationMidRunDoesNotProduceACompletedResult() async {
        let mock = MockProcessRunner()
        mock.delayNanoseconds = 400_000_000
        mock.output = ProcessOutput(exitCode: 0, stdout: "", stderr: "")
        let runner = makeRunner(mock)

        let task = Task<WinTunerPackageResult, Error> {
            try await runner.package(
                configuration: self.makeConfiguration(),
                manifest: self.makeManifest(),
                log: { _ in },
                isCancelled: { false }
            )
        }

        try? await Task.sleep(nanoseconds: 50_000_000)
        task.cancel()

        do {
            _ = try await task.value
            XCTFail("expected the cancelled task to throw rather than complete")
        } catch is CancellationError {
            // expected
        } catch {
            XCTFail("expected CancellationError, got \(error)")
        }
    }

    func testIsCancelledClosureAbortsBeforeInvokingTheProcess() async {
        let mock = MockProcessRunner()
        let runner = makeRunner(mock)

        do {
            _ = try await runner.package(
                configuration: makeConfiguration(),
                manifest: makeManifest(),
                log: { _ in },
                isCancelled: { true }
            )
            XCTFail("expected cancellation error")
        } catch is CancellationError {
            XCTAssertEqual(mock.callCount, 0)
        } catch {
            XCTFail("expected CancellationError, got \(error)")
        }
    }
}
