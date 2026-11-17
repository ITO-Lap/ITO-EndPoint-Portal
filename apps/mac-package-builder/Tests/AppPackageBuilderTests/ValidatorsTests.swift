import XCTest
@testable import AppPackageBuilder

final class ValidatorsTests: XCTestCase {

    func testValidTokensAccepted() {
        for token in ["redis", "visual-studio-code", "postgresql@16", "jq", "node_exporter"] {
            XCTAssertTrue(Validators.isValidToken(token), "\(token) should be valid")
        }
    }

    func testInvalidTokensRejected() {
        for token in ["", "Redis", "-redis", "rm -rf /", "a; rm -rf /", "a$(whoami)", "a`id`", "a&&b", "a|b", "a\nb"] {
            XCTAssertFalse(Validators.isValidToken(token), "\(token) should be invalid")
        }
    }

    func testValidIdentifiersAccepted() {
        for id in ["com.AKVERMA.visual-studio-code", "com.AKVERMA.app", "org.example.tool-name"] {
            XCTAssertTrue(Validators.isValidIdentifier(id))
        }
    }

    func testInvalidIdentifiersRejected() {
        for id in ["", "com", "com.AKVERMA.$(whoami)", "com..AKVERMA", ".com.AKVERMA", "com.AKVERMA."] {
            XCTAssertFalse(Validators.isValidIdentifier(id))
        }
    }

    func testValidVersionsAccepted() {
        for v in ["1.0", "latest", "16.4_1", "2024.09.17", "1.87.2"] {
            XCTAssertTrue(Validators.isValidVersion(v))
        }
    }

    func testInvalidVersionsRejected() {
        for v in ["", "1.0; rm -rf /", "1.0 && echo hi", "$(id)"] {
            XCTAssertFalse(Validators.isValidVersion(v))
        }
    }
}
