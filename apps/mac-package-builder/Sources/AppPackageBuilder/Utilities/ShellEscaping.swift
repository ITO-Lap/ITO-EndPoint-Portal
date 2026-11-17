import Foundation

/// Safe escaping helpers for content that must be embedded in generated shell scripts
/// or plist/XML files. Generated scripts are executed with `/bin/bash <file>` (not
/// `bash -c "$interpolatedString"`), and every dynamic value that lands inside one is
/// routed through `shellSingleQuoted` before being written, so a hostile token/version
/// string can never break out of its quoting context.
enum ShellEscaping {

    /// Wraps a value in single quotes, escaping any embedded single quote as `'\''`.
    /// This is the only shell-safe way to embed arbitrary text as a single shell word.
    static func shellSingleQuoted(_ value: String) -> String {
        "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    /// Escapes text for safe inclusion inside an XML/plist text node or attribute value.
    static func xmlEscaped(_ value: String) -> String {
        var result = value
        result = result.replacingOccurrences(of: "&", with: "&amp;")
        result = result.replacingOccurrences(of: "<", with: "&lt;")
        result = result.replacingOccurrences(of: ">", with: "&gt;")
        result = result.replacingOccurrences(of: "\"", with: "&quot;")
        result = result.replacingOccurrences(of: "'", with: "&apos;")
        return result
    }

    /// Produces a `<string>` plist element with correctly escaped content.
    static func plistStringElement(_ value: String) -> String {
        "<string>\(xmlEscaped(value))</string>"
    }
}
