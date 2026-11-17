import Foundation

/// Removes ANSI/VT escape sequences (colors, cursor moves) that PowerShell and
/// other CLI tools emit, so logs and error text show as plain text in the UI.
enum AnsiStripper {
    private static let pattern = try! NSRegularExpression(pattern: "\u{001B}\\[[0-9;?]*[ -/]*[@-~]")

    static func strip(_ text: String) -> String {
        let range = NSRange(text.startIndex..., in: text)
        return pattern.stringByReplacingMatches(in: text, range: range, withTemplate: "")
    }
}
