import XCTest
@testable import AppPackageBuilder

final class WinTunerVersionFallbackTests: XCTestCase {

    private final class StubRunner: ProcessRunning {
        var stdout = ""
        func run(_ executablePath: String, arguments: [String], currentDirectory: URL?,
                 environment: [String: String]?, onOutputLine: (@Sendable (String) -> Void)?) async throws -> ProcessOutput {
            ProcessOutput(exitCode: 0, stdout: stdout, stderr: "")
        }
    }

    private final class CapturingDownloader: WinGetInstallerDownloading, @unchecked Sendable {
        private(set) var versions: [String] = []
        func downloadInstaller(manifest: WinGetInstallerManifest, applicationName: String?, to directory: URL) async throws -> WinGetInstallerDownloadResult {
            versions.append(manifest.version)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let url = directory.appendingPathComponent("installer-\(manifest.version).exe")
            try Data("x".utf8).write(to: url)
            return WinGetInstallerDownloadResult(fileURL: url, sha256Verified: true)
        }
    }

    private func manifest(version: String) -> WinGetInstallerManifest {
        WinGetInstallerManifest(
            packageId: "Google.Chrome.Dev", version: version,
            installerURL: URL(string: "https://example.com/chrome.exe")!, installerType: .exe, architecture: .x64,
            scope: .machine, sha256: "abc", silentInstallSwitches: nil, silentUninstallSwitches: nil,
            upgradeCode: nil, productCode: nil, expectedOutputName: "Chrome Dev", locale: "en-US")
    }

    private func run(stdout: String, provider: @escaping @Sendable (String, WinGetArchitecture, WinGetInstallerType?) async throws -> WinGetInstallerManifest,
                     downloader: CapturingDownloader) async throws -> WinTunerPackageResult {
        let stub = StubRunner(); stub.stdout = stdout
        let runner = WinTunerCommandRunner(
            processRunner: stub, scriptURLOverride: URL(fileURLWithPath: "/fake/setup.sh"),
            installerDownloader: downloader, latestManifestProvider: provider)
        var config = WinTunerPackageConfiguration()
        config.version = "159.0.8144.0"
        config.outputDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("fallback-\(UUID().uuidString)").path
        return try await runner.package(configuration: config, manifest: manifest(version: "159.0.8144.0"),
                                        log: { _ in }, isCancelled: { false })
    }

    func testFallbackReResolvesManifestSoInstallerMatchesPackagedVersion() async throws {
        let downloader = CapturingDownloader()
        _ = try await run(stdout: "NOTICE...\nBPB_VERSION_FALLBACK=1\n",
                          provider: { [self] _, _, _ in manifest(version: "160.0.8157.0") }, downloader: downloader)
        XCTAssertEqual(downloader.versions, ["160.0.8157.0"])
    }

    func testFallbackSkipsInstallerDownloadIfLatestCannotBeResolved() async throws {
        struct Boom: Error {}
        let downloader = CapturingDownloader()
        let result = try await run(stdout: "BPB_VERSION_FALLBACK=1", provider: { _, _, _ in throw Boom() }, downloader: downloader)
        XCTAssertTrue(downloader.versions.isEmpty)
        XCTAssertFalse(result.installerDownloaded)
    }

    func testNoFallbackKeepsRequestedVersionAndNeverCallsProvider() async throws {
        let downloader = CapturingDownloader()
        _ = try await run(stdout: "all good", provider: { _, _, _ in XCTFail("provider must not run"); throw CancellationError() }, downloader: downloader)
        XCTAssertEqual(downloader.versions, ["159.0.8144.0"])
    }

    func testAnsiStripperRemovesColorCodes() {
        let raw = "\u{1B}[31;1mNew-WtWingetPackage: \u{1B}[0mfailed \u{1B}[36;1m~~~\u{1B}[0m"
        XCTAssertEqual(AnsiStripper.strip(raw), "New-WtWingetPackage: failed ~~~")
    }

    func testCommandFailedMessageIsPlainAndFriendlyFor404() {
        let raw = "\u{1B}[31;1mResponse status code does not indicate success: 404 (Not Found).\u{1B}[0m"
        let message = WinTunerCommandRunnerError.commandFailed(exitCode: 1, stderr: raw).errorDescription ?? ""
        XCTAssertFalse(message.contains("\u{1B}"))
        XCTAssertTrue(message.contains("no longer lists"))
        let other = WinTunerCommandRunnerError.commandFailed(exitCode: 1, stderr: "\u{1B}[31mboom\u{1B}[0m").errorDescription ?? ""
        XCTAssertEqual(other, "The command failed (exit code 1): boom")
    }

    func testInterruptedDownloadGetsFriendlyMessage() {
        let message = WinTunerCommandRunnerError.commandFailed(exitCode: 1, stderr: "Error while copying content to a stream.").errorDescription ?? ""
        XCTAssertTrue(message.contains("download was interrupted"))
    }
}
