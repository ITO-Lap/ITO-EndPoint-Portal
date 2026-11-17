import XCTest
@testable import AppPackageBuilder

/// `pkgutil --expand` writes real files to disk; rather than mock the
/// filesystem, this mock intercepts the `pkgutil --expand` invocation and
/// synthesizes exactly those files at the destination the service asked for,
/// so the rest of `PackageInspectorService` runs against real `Data`/`String`
/// parsing and a real (temporary) `lsbom` call.
private final class MockProcessRunner: ProcessRunning {
    var lsbomOutput = ""
    var signatureOutput = ""
    var expandShouldFail = false

    func run(
        _ executablePath: String,
        arguments: [String],
        currentDirectory: URL?,
        environment: [String: String]?,
        onOutputLine: (@Sendable (String) -> Void)?
    ) async throws -> ProcessOutput {
        if arguments.first == "--expand" {
            if expandShouldFail {
                return ProcessOutput(exitCode: 1, stdout: "", stderr: "pkgutil: Skipping: already exists")
            }
            guard arguments.count >= 3 else { return ProcessOutput(exitCode: 1, stdout: "", stderr: "bad args") }
            let destination = URL(fileURLWithPath: arguments[2])
            try? FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            let packageInfoXML = """
            <?xml version="1.0" encoding="utf-8"?>
            <pkg-info format-version="2" identifier="com.AKVERMA.redis" version="7.2.4" install-location="/" auth="root">
            </pkg-info>
            """
            try? packageInfoXML.write(to: destination.appendingPathComponent("PackageInfo"), atomically: true, encoding: .utf8)
            try? Data().write(to: destination.appendingPathComponent("Bom"))
            let scriptsDir = destination.appendingPathComponent("Scripts")
            try? FileManager.default.createDirectory(at: scriptsDir, withIntermediateDirectories: true)
            try? "#!/bin/bash\nexit 0\n".write(to: scriptsDir.appendingPathComponent("postinstall"), atomically: true, encoding: .utf8)
            return ProcessOutput(exitCode: 0, stdout: "", stderr: "")
        }
        if arguments.first == "--check-signature" {
            return ProcessOutput(exitCode: 0, stdout: signatureOutput, stderr: "")
        }
        if executablePath.hasSuffix("lsbom") {
            return ProcessOutput(exitCode: 0, stdout: lsbomOutput, stderr: "")
        }
        return ProcessOutput(exitCode: 0, stdout: "", stderr: "")
    }
}

final class PackageInspectorServiceTests: XCTestCase {

    private func makeFakePackage() throws -> URL {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("fake-\(UUID().uuidString).pkg")
        try Data("not a real pkg, just needs to exist".utf8).write(to: path)
        return path
    }

    func testInspectParsesIdentifierVersionAndInstallLocation() async throws {
        let pkg = try makeFakePackage()
        defer { try? FileManager.default.removeItem(at: pkg) }

        let runner = MockProcessRunner()
        runner.lsbomOutput = "./Applications\n./Applications/Redis.app\n./Applications/Redis.app/Contents\n"
        runner.signatureOutput = "Package \"redis-Installer.pkg\":\n   Status: signed by a certificate trusted by macOS\n"

        let service = PackageInspectorService(processRunner: runner)
        let report = try await service.inspect(packageAt: pkg)

        XCTAssertEqual(report.identifier, "com.AKVERMA.redis")
        XCTAssertEqual(report.version, "7.2.4")
        XCTAssertEqual(report.installLocation, "/")
        XCTAssertEqual(report.scriptNames, ["postinstall"])
        XCTAssertEqual(report.payloadFileCount, 3)
        XCTAssertTrue(report.signatureStatus.contains("signed by a certificate"))
    }

    func testInspectReportsUnsignedWhenCheckSignatureIsEmpty() async throws {
        let pkg = try makeFakePackage()
        defer { try? FileManager.default.removeItem(at: pkg) }

        let runner = MockProcessRunner()
        runner.signatureOutput = ""

        let service = PackageInspectorService(processRunner: runner)
        let report = try await service.inspect(packageAt: pkg)

        XCTAssertEqual(report.signatureStatus, "Package is not signed.")
    }

    func testInspectThrowsWhenPackageDoesNotExist() async {
        let service = PackageInspectorService(processRunner: MockProcessRunner())
        let missing = FileManager.default.temporaryDirectory.appendingPathComponent("does-not-exist-\(UUID().uuidString).pkg")

        do {
            _ = try await service.inspect(packageAt: missing)
            XCTFail("expected notFound error")
        } catch PackageInspectorError.notFound {
            // expected
        } catch {
            XCTFail("expected PackageInspectorError.notFound, got \(error)")
        }
    }

    func testInspectSurfacesExpandFailureAsError() async throws {
        let pkg = try makeFakePackage()
        defer { try? FileManager.default.removeItem(at: pkg) }

        let runner = MockProcessRunner()
        runner.expandShouldFail = true
        let service = PackageInspectorService(processRunner: runner)

        do {
            _ = try await service.inspect(packageAt: pkg)
            XCTFail("expected expandFailed error")
        } catch PackageInspectorError.expandFailed {
            // expected
        }
    }
}
