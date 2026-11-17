import XCTest
@testable import AppPackageBuilder

private final class MockProcessRunner: ProcessRunning {
    struct Invocation { let executablePath: String; let arguments: [String] }
    private(set) var invocations: [Invocation] = []
    var outputProvider: (String, [String]) -> ProcessOutput = { _, _ in ProcessOutput(exitCode: 0, stdout: "", stderr: "") }

    func run(
        _ executablePath: String,
        arguments: [String],
        currentDirectory: URL?,
        environment: [String: String]?,
        onOutputLine: (@Sendable (String) -> Void)?
    ) async throws -> ProcessOutput {
        invocations.append(Invocation(executablePath: executablePath, arguments: arguments))
        return outputProvider(executablePath, arguments)
    }
}

/// `HomebrewService.locateBrewExecutable()` checks fixed, real filesystem
/// paths rather than an injectable dependency, so these tests only run where
/// Homebrew is actually installed — consistent with how the rest of the app
/// already assumes those paths.
final class HomebrewServiceSearchTests: XCTestCase {

    private func skipIfHomebrewMissing() throws {
        let present = FileManager.default.isExecutableFile(atPath: "/opt/homebrew/bin/brew")
            || FileManager.default.isExecutableFile(atPath: "/usr/local/bin/brew")
        try XCTSkipUnless(present, "Homebrew is not installed at a known path on this machine")
    }

    func testSearchMergesCaskAndFormulaResults() async throws {
        try skipIfHomebrewMissing()
        let runner = MockProcessRunner()
        runner.outputProvider = { _, arguments in
            if arguments.contains("--casks") {
                return ProcessOutput(exitCode: 0, stdout: "visual-studio-code\nvisual-studio-code@insiders\n", stderr: "")
            } else {
                return ProcessOutput(exitCode: 0, stdout: "redis\nredis-leveldb\n", stderr: "")
            }
        }
        let service = HomebrewService(processRunner: runner)

        let results = try await service.search(query: "visual")

        let casks = results.filter { $0.kind == .cask }.map(\.token)
        let formulae = results.filter { $0.kind == .formula }.map(\.token)
        XCTAssertEqual(Set(casks), ["visual-studio-code", "visual-studio-code@insiders"])
        XCTAssertEqual(Set(formulae), ["redis", "redis-leveldb"])
    }

    func testSearchFiltersOutNonTokenLines() async throws {
        try skipIfHomebrewMissing()
        let runner = MockProcessRunner()
        runner.outputProvider = { _, _ in
            ProcessOutput(exitCode: 0, stdout: "valid-token\n==> Formulae\n\n", stderr: "")
        }
        let service = HomebrewService(processRunner: runner)

        let results = try await service.search(query: "valid")

        XCTAssertTrue(results.allSatisfy { $0.token == "valid-token" })
        XCTAssertFalse(results.contains { $0.token.contains("==>") })
    }

    func testSearchWithBlankQueryReturnsNoResultsWithoutInvokingProcess() async throws {
        try skipIfHomebrewMissing()
        let runner = MockProcessRunner()
        let service = HomebrewService(processRunner: runner)

        let results = try await service.search(query: "   ")

        XCTAssertTrue(results.isEmpty)
        XCTAssertTrue(runner.invocations.isEmpty)
    }

    func testInfoDecodesCaskJSONFromMockedProcessOutput() async throws {
        try skipIfHomebrewMissing()
        let runner = MockProcessRunner()
        runner.outputProvider = { _, _ in
            let json = """
            {
              "casks": [{
                "token": "visual-studio-code",
                "name": ["Visual Studio Code"],
                "desc": "Code editing. Redefined.",
                "homepage": "https://code.visualstudio.com/",
                "version": "1.87.2",
                "sha256": "abc123",
                "url": "https://update.code.visualstudio.com/1.87.2/darwin/stable",
                "artifacts": [{ "app": ["Visual Studio Code.app"] }],
                "depends_on": {}
              }],
              "formulae": []
            }
            """
            return ProcessOutput(exitCode: 0, stdout: json, stderr: "")
        }
        let service = HomebrewService(processRunner: runner)

        let info = try await service.info(token: "visual-studio-code", kind: .cask)

        XCTAssertEqual(info.name, "Visual Studio Code")
        XCTAssertEqual(info.artifactAppNames, ["Visual Studio Code.app"])
    }

    func testInfoRejectsInvalidTokenWithoutInvokingProcess() async throws {
        try skipIfHomebrewMissing()
        let runner = MockProcessRunner()
        let service = HomebrewService(processRunner: runner)

        do {
            _ = try await service.info(token: "; rm -rf /", kind: .formula)
            XCTFail("expected invalidToken error")
        } catch HomebrewServiceError.invalidToken {
            // expected
        }
        XCTAssertTrue(runner.invocations.isEmpty)
    }
}
