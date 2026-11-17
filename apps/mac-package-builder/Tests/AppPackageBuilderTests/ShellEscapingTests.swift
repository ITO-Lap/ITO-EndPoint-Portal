import XCTest
@testable import AppPackageBuilder

final class ShellEscapingTests: XCTestCase {

    func testSingleQuoteEscaping() {
        let escaped = ShellEscaping.shellSingleQuoted("it's a test")
        XCTAssertEqual(escaped, "'it'\\''s a test'")
    }

    func testAmpersandIsNotSpecialInsideSingleQuotes() {
        // The historical brew2pkg.sh bug: bash's `${var//&/repl}` treats a
        // literal '&' as "insert the match" when used as a *replacement*.
        // Our quoting wraps the raw value, so '&' needs no special handling.
        let escaped = ShellEscaping.shellSingleQuoted("foo &>/dev/null bar")
        XCTAssertEqual(escaped, "'foo &>/dev/null bar'")
    }

    func testNoQuotingBreakout() {
        let hostile = "'; rm -rf / #"
        let escaped = ShellEscaping.shellSingleQuoted(hostile)
        // The escaped form must never contain an unescaped closing quote
        // followed directly by shell-interpretable content.
        XCTAssertTrue(escaped.hasPrefix("'"))
        XCTAssertTrue(escaped.contains("'\\''"))
    }

    func testXMLEscaping() {
        XCTAssertEqual(ShellEscaping.xmlEscaped("<script>&\"'"), "&lt;script&gt;&amp;&quot;&apos;")
    }

    func testPlistStringElement() {
        XCTAssertEqual(ShellEscaping.plistStringElement("A & B"), "<string>A &amp; B</string>")
    }
}
