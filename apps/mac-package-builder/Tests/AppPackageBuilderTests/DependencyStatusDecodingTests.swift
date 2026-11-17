import XCTest
@testable import AppPackageBuilder

/// Decodes the REAL JSON captured from running
/// `setup-winget-packager-macos.sh check --json` in this session, to confirm
/// `DependencyStatus`'s `CodingKeys` match the script's actual output
/// exactly (not a guessed schema).
final class DependencyStatusDecodingTests: XCTestCase {

    func testDecodesRealCapturedReadyJSON() throws {
        let json = #"""
        {"macOS":true,"homebrew":true,"powershell":true,"winTuner":true,"powershellVersion":"7.6.6","winTunerVersion":"1.4.1","ready":true}
        """#

        let status = try JSONDecoder().decode(DependencyStatus.self, from: Data(json.utf8))

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

    func testDecodesNotReadyVariantWhenWinTunerModuleIsMissing() throws {
        let json = #"""
        {"macOS":true,"homebrew":true,"powershell":true,"winTuner":false,"powershellVersion":"7.6.6","winTunerVersion":"","ready":false}
        """#

        let status = try JSONDecoder().decode(DependencyStatus.self, from: Data(json.utf8))

        XCTAssertFalse(status.winTuner)
        XCTAssertFalse(status.ready)
        XCTAssertTrue(status.macOS)
        XCTAssertTrue(status.homebrew)
        XCTAssertTrue(status.powershell)
        XCTAssertEqual(status.powershellVersion, "7.6.6")
        XCTAssertEqual(status.winTunerVersion, "")
    }

    func testDecodesEmptyVersionStringsEdgeCaseWhenNothingIsInstalledYet() throws {
        let json = #"""
        {"macOS":true,"homebrew":false,"powershell":false,"winTuner":false,"powershellVersion":"","winTunerVersion":"","ready":false}
        """#

        let status = try JSONDecoder().decode(DependencyStatus.self, from: Data(json.utf8))

        XCTAssertEqual(status.powershellVersion, "")
        XCTAssertEqual(status.winTunerVersion, "")
        XCTAssertFalse(status.homebrew)
        XCTAssertFalse(status.powershell)
        XCTAssertFalse(status.ready)
    }

    func testRoundTripsThroughEncodeAndDecode() throws {
        let original = DependencyStatus(
            macOS: true,
            homebrew: true,
            powershell: true,
            winTuner: true,
            powershellVersion: "7.6.6",
            winTunerVersion: "1.4.1",
            ready: true
        )

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(DependencyStatus.self, from: data)

        XCTAssertEqual(decoded, original)
    }

    func testNotCheckedSentinelIsNotReady() {
        XCTAssertFalse(DependencyStatus.notChecked.ready)
        XCTAssertFalse(DependencyStatus.notChecked.winTuner)
        XCTAssertEqual(DependencyStatus.notChecked.powershellVersion, "")
        XCTAssertEqual(DependencyStatus.notChecked.winTunerVersion, "")
    }
}
