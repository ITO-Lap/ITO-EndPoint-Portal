import Foundation
import XCTest
@testable import AppGuardianInventory

private struct StubSignatureInspector: CodeSignatureInspecting {
    let inspection: CodeSignatureInspection

    func inspect(at applicationURL: URL) -> CodeSignatureInspection {
        inspection
    }
}

final class ApplicationScannerTests: XCTestCase {
    func testStandardRootsAreApplicationsAndCurrentUsersApplications() {
        let home = URL(fileURLWithPath: "/Users/example", isDirectory: true)
        let roots = InventoryScanRoot.standard(userHome: home)

        XCTAssertEqual(roots.map(\.url.path), ["/Applications", "/Users/example/Applications"])
        XCTAssertEqual(roots.map(\.source), [.systemApplications, .currentUserApplications])
    }

    func testScanReadsBundleMetadataAndSignatureWithoutChangingTheApp() throws {
        let temporaryDirectory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: temporaryDirectory) }
        let appURL = try makeApp(
            named: "Sample.app",
            in: temporaryDirectory,
            metadata: [
                "CFBundleIdentifier": "com.example.sample",
                "CFBundleName": "Sample Product",
                "CFBundleShortVersionString": "3.4.1",
                "CFBundleVersion": "30401"
            ]
        )
        let modificationDate = Date(timeIntervalSince1970: 1_700_000_000)
        try FileManager.default.setAttributes([.modificationDate: modificationDate], ofItemAtPath: appURL.path)
        let signature = CodeSignatureInspection(status: .valid, teamIdentifier: "ABCDE12345")
        let scanner = ApplicationScanner(
            roots: [InventoryScanRoot(url: temporaryDirectory, source: .currentUserApplications)],
            signatureInspector: StubSignatureInspector(inspection: signature)
        )

        let result = scanner.scan()

        XCTAssertEqual(result.issues, [])
        XCTAssertEqual(result.applications.count, 1)
        let application = try XCTUnwrap(result.applications.first)
        XCTAssertEqual(application.name, "Sample Product")
        XCTAssertEqual(application.bundleIdentifier, "com.example.sample")
        XCTAssertEqual(application.shortVersion, "3.4.1")
        XCTAssertEqual(application.bundleVersion, "30401")
        XCTAssertEqual(application.installPath, appURL.standardizedFileURL.path)
        XCTAssertEqual(application.installSource, .currentUserApplications)
        XCTAssertEqual(application.codeSignature, signature)
        XCTAssertEqual(application.lastModifiedAt, modificationDate)
        XCTAssertTrue(FileManager.default.fileExists(atPath: appURL.path))
    }

    func testScanSkipsNestedBundleContentsAndReportsInvalidApplicationMetadata() throws {
        let temporaryDirectory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: temporaryDirectory) }
        let outerURL = try makeApp(
            named: "Outer.app",
            in: temporaryDirectory,
            metadata: ["CFBundleIdentifier": "com.example.outer"]
        )
        _ = try makeApp(
            named: "Nested.app",
            in: outerURL.appendingPathComponent("Contents/Helpers", isDirectory: true),
            metadata: ["CFBundleIdentifier": "com.example.nested"]
        )
        _ = try makeApp(named: "Malformed.app", in: temporaryDirectory, metadata: ["CFBundleName": "No ID"])
        let scanner = ApplicationScanner(
            roots: [InventoryScanRoot(url: temporaryDirectory, source: .systemApplications)],
            signatureInspector: StubSignatureInspector(inspection: CodeSignatureInspection(status: .unsigned, teamIdentifier: nil))
        )

        let result = scanner.scan()

        XCTAssertEqual(result.applications.map(\.bundleIdentifier), ["com.example.outer"])
        XCTAssertEqual(result.issues.count, 1)
        XCTAssertTrue(result.issues[0].path.hasSuffix("Malformed.app"))
        XCTAssertEqual(result.issues[0].message, "Application bundle has no CFBundleIdentifier.")
    }

    func testMissingScanRootIsReportedAndDoesNotFailTheScan() throws {
        let temporaryDirectory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: temporaryDirectory) }
        let missingRoot = temporaryDirectory.appendingPathComponent("Missing", isDirectory: true)
        let scanner = ApplicationScanner(roots: [InventoryScanRoot(url: missingRoot, source: .systemApplications)])

        let result = scanner.scan()

        XCTAssertTrue(result.applications.isEmpty)
        XCTAssertEqual(result.issues.count, 1)
        XCTAssertEqual(result.issues[0].path, missingRoot.path)
    }

    private func makeTemporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func makeApp(named name: String, in directory: URL, metadata: [String: Any]) throws -> URL {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let appURL = directory.appendingPathComponent(name, isDirectory: true)
        let contentsURL = appURL.appendingPathComponent("Contents", isDirectory: true)
        try FileManager.default.createDirectory(at: contentsURL, withIntermediateDirectories: true)
        let infoData = try PropertyListSerialization.data(fromPropertyList: metadata, format: .xml, options: 0)
        try infoData.write(to: contentsURL.appendingPathComponent("Info.plist"))
        return appURL
    }
}