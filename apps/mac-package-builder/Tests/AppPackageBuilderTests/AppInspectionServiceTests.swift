import XCTest
@testable import AppPackageBuilder

private final class MockProcessRunner: ProcessRunning {
    var codesignOutputByPath: [String: ProcessOutput] = [:]
    var requirementOutputByPath: [String: ProcessOutput] = [:]
    var plistBuddyOverrides: [String: String] = [:] // "<plistPath>|<key>" -> value

    private func canonicalPath(_ rawPath: String) -> String {
        URL(fileURLWithPath: rawPath).standardizedFileURL.resolvingSymlinksInPath().path
    }

    func run(
        _ executablePath: String,
        arguments: [String],
        currentDirectory: URL?,
        environment: [String: String]?,
        onOutputLine: (@Sendable (String) -> Void)?
    ) async throws -> ProcessOutput {
        if executablePath.hasSuffix("codesign") {
            let rawPath = arguments.last ?? ""
            let canonicalPathValue = canonicalPath(rawPath)
            let candidates = [rawPath, canonicalPathValue]
            if arguments.contains("-r-") {
                for key in candidates {
                    if let value = requirementOutputByPath[key] { return value }
                }
                return ProcessOutput(exitCode: 1, stdout: "", stderr: "not signed")
            }
            for key in candidates {
                if let value = codesignOutputByPath[key] { return value }
            }
            return ProcessOutput(exitCode: 1, stdout: "", stderr: "code object is not signed at all")
        }
        if executablePath.hasSuffix("PlistBuddy") {
            // arguments: ["-c", "Print :Key:Path", plistPath]
            guard arguments.count >= 3 else { return ProcessOutput(exitCode: 1, stdout: "", stderr: "bad args") }
            let rawPlistPath = arguments[2]
            let canonicalPlistPath = canonicalPath(rawPlistPath)
            let printCommand = arguments[1]
            let key = printCommand.replacingOccurrences(of: "Print :", with: "")
            for plistPath in [rawPlistPath, canonicalPlistPath] {
                let lookupKey = "\(plistPath)|\(key)"
                if let value = plistBuddyOverrides[lookupKey] {
                    return ProcessOutput(exitCode: 0, stdout: value, stderr: "")
                }
            }
            return ProcessOutput(exitCode: 1, stdout: "", stderr: "Does Not Exist")
        }
        return ProcessOutput(exitCode: 0, stdout: "", stderr: "")
    }
}

final class AppInspectionServiceTests: XCTestCase {
    private var tempAppPath: URL!

    override func setUpWithError() throws {
        tempAppPath = FileManager.default.temporaryDirectory.appendingPathComponent("Fake-\(UUID().uuidString).app")
        try FileManager.default.createDirectory(at: tempAppPath.appendingPathComponent("Contents"), withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: tempAppPath)
    }

    private func writeInfoPlist(_ dict: [String: Any], at url: URL) throws {
        let data = try PropertyListSerialization.data(fromPropertyList: dict, format: .xml, options: 0)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url)
    }

    func testInspectSignatureThrowsForNonAppBundle() async {
        let notAnApp = FileManager.default.temporaryDirectory.appendingPathComponent("NotAnApp-\(UUID().uuidString)")
        let service = AppInspectionService(processRunner: MockProcessRunner())
        do {
            _ = try await service.inspectSignature(appPath: notAnApp)
            XCTFail("expected notAnAppBundle error")
        } catch AppInspectionError.notAnAppBundle {
            // expected
        } catch {
            XCTFail("wrong error: \(error)")
        }
    }

    func testInspectSignatureExtractsRealFieldsFromCodesignOutput() async throws {
        let infoPlist = tempAppPath.appendingPathComponent("Contents/Info.plist")
        try writeInfoPlist(["CFBundleIdentifier": "com.example.app", "CFBundleExecutable": "Example"], at: infoPlist)

        let runner = MockProcessRunner()
        runner.plistBuddyOverrides["\(infoPlist.path)|CFBundleIdentifier"] = "com.example.app"
        runner.plistBuddyOverrides["\(infoPlist.path)|CFBundleExecutable"] = "Example"
        runner.codesignOutputByPath[tempAppPath.path] = ProcessOutput(
            exitCode: 0, stdout: "",
            stderr: "Executable=\(tempAppPath.path)/Contents/MacOS/Example\nIdentifier=com.example.app\nTeamIdentifier=TEAM1234\nNotarization Ticket=stapled\n"
        )
        runner.requirementOutputByPath[tempAppPath.path] = ProcessOutput(
            exitCode: 0, stdout: "designated => identifier \"com.example.app\" and anchor apple generic\n", stderr: ""
        )

        let service = AppInspectionService(processRunner: runner)
        let info = try await service.inspectSignature(appPath: tempAppPath)

        XCTAssertEqual(info.bundleIdentifier, "com.example.app")
        XCTAssertEqual(info.teamIdentifier, "TEAM1234")
        XCTAssertEqual(info.codeRequirement, "identifier \"com.example.app\" and anchor apple generic")
        XCTAssertTrue(info.isSigned)
        XCTAssertTrue(info.isNotarized)
        XCTAssertEqual(info.executablePath, tempAppPath.appendingPathComponent("Contents/MacOS/Example").path)
    }

    func testInspectSignatureHandlesUnsignedAppWithoutCrashing() async throws {
        let infoPlist = tempAppPath.appendingPathComponent("Contents/Info.plist")
        try writeInfoPlist(["CFBundleIdentifier": "com.example.unsigned"], at: infoPlist)
        let runner = MockProcessRunner()
        runner.plistBuddyOverrides["\(infoPlist.path)|CFBundleIdentifier"] = "com.example.unsigned"

        let service = AppInspectionService(processRunner: runner)
        let info = try await service.inspectSignature(appPath: tempAppPath)

        XCTAssertFalse(info.isSigned)
        XCTAssertNil(info.teamIdentifier)
        XCTAssertNil(info.codeRequirement)
    }

    func testDetectSystemExtensionClassifiesNetworkExtensionProviderFromRealClassName() async throws {
        let extPath = tempAppPath.appendingPathComponent("Contents/Library/SystemExtensions/com.example.filter.appex")
        let extInfoPlist = extPath.appendingPathComponent("Contents/Info.plist")
        try writeInfoPlist(["CFBundleIdentifier": "com.example.filter"], at: extInfoPlist)

        let runner = MockProcessRunner()
        runner.plistBuddyOverrides["\(extInfoPlist.path)|CFBundleIdentifier"] = "com.example.filter"
        runner.plistBuddyOverrides["\(extInfoPlist.path)|NSExtension:NSExtensionPointIdentifier"] = "com.apple.system_extension.network_extension"
        runner.plistBuddyOverrides["\(extInfoPlist.path)|NSExtension:NSExtensionAttributes:NetworkExtensionProviderClasses"] = "{\n    \"com.example.filter\" = MyFilterDataProvider;\n}"
        runner.codesignOutputByPath[extPath.path] = ProcessOutput(exitCode: 0, stdout: "", stderr: "TeamIdentifier=TEAM1234\n")

        let service = AppInspectionService(processRunner: runner)
        let extensions = await service.detectSystemExtensions(appPath: tempAppPath)

        XCTAssertEqual(extensions.count, 1)
        XCTAssertEqual(extensions.first?.identifier, "com.example.filter")
        XCTAssertEqual(extensions.first?.pointKind, .networkExtension)
        XCTAssertEqual(extensions.first?.networkProviderKind, .contentFilter)
        XCTAssertEqual(extensions.first?.teamIdentifier, "TEAM1234")
    }

    func testDetectBackgroundItemsFindsLaunchAgentsAndHelpers() async throws {
        let launchAgentsDir = tempAppPath.appendingPathComponent("Contents/Library/LaunchAgents")
        try FileManager.default.createDirectory(at: launchAgentsDir, withIntermediateDirectories: true)
        let agentPlist = launchAgentsDir.appendingPathComponent("com.example.agent.plist")
        try writeInfoPlist(["Label": "com.example.agent", "ProgramArguments": ["/bin/true"]], at: agentPlist)

        let helpersDir = tempAppPath.appendingPathComponent("Contents/Library/LaunchServices")
        try FileManager.default.createDirectory(at: helpersDir, withIntermediateDirectories: true)
        try Data().write(to: helpersDir.appendingPathComponent("com.example.helper"))

        let service = AppInspectionService(processRunner: MockProcessRunner())
        let items = await service.detectBackgroundItems(appPath: tempAppPath)

        XCTAssertTrue(items.contains { $0.kind == .launchAgent && $0.identifier == "com.example.agent" })
        XCTAssertTrue(items.contains { $0.kind == .privilegedHelper && $0.isRequiredForOperation })
    }

    func testDetectBackgroundItemsReturnsEmptyWhenNoneBundled() async {
        let service = AppInspectionService(processRunner: MockProcessRunner())
        let items = await service.detectBackgroundItems(appPath: tempAppPath)
        XCTAssertTrue(items.isEmpty)
    }
}
