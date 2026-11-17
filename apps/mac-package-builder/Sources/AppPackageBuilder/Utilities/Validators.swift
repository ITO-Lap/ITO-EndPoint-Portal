import Foundation

/// Input validators for values that end up embedded in generated scripts, plists,
/// or filesystem paths. Every one of these MUST pass before the corresponding value
/// is used anywhere outside of display — this is the app's primary defense against
/// script/command injection, since a rejected token/identifier/version never reaches
/// `Process` arguments or generated script text.
enum ValidationError: LocalizedError, Equatable {
    case invalidHomebrewToken(String)
    case invalidPackageIdentifier(String)
    case invalidVersion(String)
    case invalidPath(String)

    var errorDescription: String? {
        switch self {
        case .invalidHomebrewToken(let v):
            return "\"\(v)\" is not a valid Homebrew formula/cask token."
        case .invalidPackageIdentifier(let v):
            return "\"\(v)\" is not a valid reverse-DNS package identifier."
        case .invalidVersion(let v):
            return "\"\(v)\" is not a valid version string."
        case .invalidPath(let v):
            return "\"\(v)\" is not a valid, safe filesystem path."
        }
    }
}

enum Validators {

    /// Homebrew tokens are lowercase, may contain digits, `-`, `_`, `.`, `@`, `+`
    /// (e.g. "postgresql@16", "visual-studio-code"). No shell metacharacters, no spaces.
    private static let tokenPattern = #"^[a-z0-9][a-z0-9._@+-]{0,127}$"#

    /// Reverse-DNS style identifier, e.g. "com.VERMA.visual-studio-code".
    private static let identifierPattern = #"^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$"#

    /// Loose semantic-ish version: digits/letters separated by `.`, `-`, `_`, `+`.
    private static let versionPattern = #"^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$"#

    static func isValidToken(_ token: String) -> Bool {
        matches(token, pattern: tokenPattern)
    }

    static func validateToken(_ token: String) throws -> String {
        guard isValidToken(token) else { throw ValidationError.invalidHomebrewToken(token) }
        return token
    }

    static func isValidIdentifier(_ identifier: String) -> Bool {
        matches(identifier, pattern: identifierPattern) && identifier.count <= 255
    }

    static func validateIdentifier(_ identifier: String) throws -> String {
        guard isValidIdentifier(identifier) else { throw ValidationError.invalidPackageIdentifier(identifier) }
        return identifier
    }

    static func isValidVersion(_ version: String) -> Bool {
        matches(version, pattern: versionPattern)
    }

    static func validateVersion(_ version: String) throws -> String {
        guard isValidVersion(version) else { throw ValidationError.invalidVersion(version) }
        return version
    }

    private static func matches(_ value: String, pattern: String) -> Bool {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return false }
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        return regex.firstMatch(in: value, range: range) != nil
    }
}
