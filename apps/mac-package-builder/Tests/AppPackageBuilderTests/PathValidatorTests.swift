import XCTest
@testable import AppPackageBuilder

final class PathValidatorTests: XCTestCase {

    func testExpandsTilde() throws {
        let url = try PathValidator.canonicalize("~")
        XCTAssertEqual(url.path, FileManager.default.homeDirectoryForCurrentUser.path)
    }

    func testRejectsRoot() {
        XCTAssertThrowsError(try PathValidator.canonicalize("/"))
    }

    func testContainmentPasses() throws {
        let root = FileManager.default.temporaryDirectory
        let child = root.appendingPathComponent("child")
        XCTAssertNoThrow(try PathValidator.require(child, toBeWithin: root))
    }

    func testContainmentRejectsEscape() {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("sandbox")
        let outside = URL(fileURLWithPath: "/etc/passwd")
        XCTAssertThrowsError(try PathValidator.require(outside, toBeWithin: root))
    }

    func testRemoveContentsSafelyRefusesOutsideRoot() {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("sandbox-\(UUID().uuidString)")
        let outside = URL(fileURLWithPath: "/tmp")
        XCTAssertThrowsError(try PathValidator.removeContentsSafely(outside, mustBeWithin: root))
    }

    func testRemoveContentsSafelyDeletesWithinRoot() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("bpb-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let child = root.appendingPathComponent("build")
        try FileManager.default.createDirectory(at: child, withIntermediateDirectories: true)
        try PathValidator.removeContentsSafely(child, mustBeWithin: root)
        XCTAssertFalse(FileManager.default.fileExists(atPath: child.path))
        try? FileManager.default.removeItem(at: root)
    }
}
