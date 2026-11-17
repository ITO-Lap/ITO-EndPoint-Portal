import XCTest
@testable import AppPackageBuilder

final class ArchitectureDetectorTests: XCTestCase {

    func testResolvesUniversalWhenBothVariantsExist() {
        XCTAssertEqual(ArchitectureDetector.resolveAutomatic(hasArmVariant: true, hasIntelVariant: true), .universal)
    }

    func testResolvesArmOnly() {
        XCTAssertEqual(ArchitectureDetector.resolveAutomatic(hasArmVariant: true, hasIntelVariant: false), .appleSilicon)
    }

    func testResolvesIntelOnly() {
        XCTAssertEqual(ArchitectureDetector.resolveAutomatic(hasArmVariant: false, hasIntelVariant: true), .intel)
    }

    func testFallsBackToHostArchitectureWhenUnknown() {
        XCTAssertEqual(ArchitectureDetector.resolveAutomatic(hasArmVariant: false, hasIntelVariant: false), ArchitectureDetector.currentHostArchitecture)
    }
}
