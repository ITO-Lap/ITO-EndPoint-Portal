import XCTest
@testable import AppPackageBuilder

final class WindowsPackageNamingServiceTests: XCTestCase {
    func testCreatesSanitizedVerifiedName() throws {
        let name = try WindowsPackageNamingService().fileName(application: "Visual Studio: Code", version: "1.96.4", architecture: .x64, ext: "exe")
        XCTAssertEqual(name, "Visual-Studio-Code-1.96.4-x64.exe")
    }

    func testRejectsMissingVersionAndTraversalOverride() {
        XCTAssertThrowsError(try WindowsPackageNamingService().fileName(application: "Test", version: "", architecture: .x64, ext: "msi"))
        XCTAssertThrowsError(try WindowsPackageNamingService().fileName(application: "Test", version: "1.0", architecture: .x64, ext: "msi", customName: "../bad"))
    }
}
