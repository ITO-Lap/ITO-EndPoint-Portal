import XCTest
@testable import AppPackageBuilder

final class SHA256VerifierTests: XCTestCase {

    /// SHA-256 of the literal ASCII bytes "The quick brown fox jumps over
    /// the lazy dog" (no trailing newline), independently computed via
    /// `python3 -c "import hashlib; print(hashlib.sha256(b'The quick brown
    /// fox jumps over the lazy dog').hexdigest())"`.
    private let knownContent = "The quick brown fox jumps over the lazy dog"
    private let knownContentSHA256 = "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592"

    private var tempFileURL: URL!

    override func setUpWithError() throws {
        tempFileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("SHA256VerifierTests-\(UUID().uuidString).txt")
        try Data(knownContent.utf8).write(to: tempFileURL)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: tempFileURL)
    }

    func testHashOfKnownFileMatchesIndependentlyComputedDigest() throws {
        let hash = try SHA256Verifier.hash(ofFileAt: tempFileURL)
        XCTAssertEqual(hash, knownContentSHA256)
    }

    func testMatchesIsCaseInsensitive() throws {
        let hash = try SHA256Verifier.hash(ofFileAt: tempFileURL)
        XCTAssertTrue(SHA256Verifier.matches(actual: hash, expected: knownContentSHA256.uppercased()))
        XCTAssertTrue(SHA256Verifier.matches(actual: hash.uppercased(), expected: knownContentSHA256))
    }

    func testMismatchIsDetected() throws {
        let hash = try SHA256Verifier.hash(ofFileAt: tempFileURL)
        let wrongHash = String(repeating: "0", count: 64)
        XCTAssertNotEqual(hash, wrongHash)
        XCTAssertFalse(SHA256Verifier.matches(actual: hash, expected: wrongHash))
    }

    func testHashThrowsForMissingFile() {
        let missing = FileManager.default.temporaryDirectory
            .appendingPathComponent("does-not-exist-\(UUID().uuidString).txt")
        XCTAssertThrowsError(try SHA256Verifier.hash(ofFileAt: missing))
    }
}
