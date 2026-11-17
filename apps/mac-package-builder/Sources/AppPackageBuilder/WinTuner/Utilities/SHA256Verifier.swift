import Foundation
import CryptoKit

/// Local SHA-256 computation for a downloaded installer, compared against
/// the official WinGet manifest's authoritative hash before packaging
/// proceeds. Uses CryptoKit, already available on the macOS 14 SDK — no new
/// dependency needed for this.
enum SHA256Verifier {

    /// Computes the lowercase hex SHA-256 digest of the file at `url`.
    /// Reads in fixed-size chunks via `FileHandle` rather than loading the
    /// whole file into memory, since installer downloads can be large.
    static func hash(ofFileAt url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }

        var hasher = SHA256()
        let chunkSize = 1024 * 1024 // 1 MB
        while true {
            let chunk = try handle.read(upToCount: chunkSize) ?? Data()
            if chunk.isEmpty { break }
            hasher.update(data: chunk)
        }
        let digest = hasher.finalize()
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    /// Case-insensitive hex comparison.
    static func matches(actual: String, expected: String) -> Bool {
        actual.caseInsensitiveCompare(expected) == .orderedSame
    }
}
