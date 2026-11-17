import XCTest
@testable import AppPackageBuilder

final class SemanticVersionTests: XCTestCase {

    func testEqualVersions() {
        XCTAssertTrue(AppVersionComparator.isEqual("1.87.2", "1.87.2"))
    }

    func testNewerVersion() {
        XCTAssertTrue(AppVersionComparator.isNewer("1.88.0", than: "1.87.2"))
        XCTAssertTrue(AppVersionComparator.isNewer("2.0.0", than: "1.99.9"))
    }

    func testOlderVersion() {
        XCTAssertTrue(AppVersionComparator.isOlder("1.87.1", than: "1.87.2"))
    }

    func testDifferingComponentCounts() {
        XCTAssertTrue(AppVersionComparator.isNewer("1.2.1", than: "1.2"))
        XCTAssertTrue(AppVersionComparator.isOlder("1.2", than: "1.2.1"))
    }

    func testUnderscoreAndUnusualSeparators() {
        XCTAssertTrue(AppVersionComparator.isNewer("16.4_2", than: "16.4_1"))
    }

    func testNonNumericFallsBackToLexicographic() {
        XCTAssertEqual(AppVersionComparator.compare("beta", "alpha"), .descending)
    }
}
