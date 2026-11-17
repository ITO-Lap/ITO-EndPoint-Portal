import Foundation

/// One entry in a GitHub "contents" API directory listing response.
/// Decoding is defensive (only the fields this app needs) since GitHub's
/// full payload includes many fields this app never uses.
struct GitHubContentsEntry: Codable {
    let name: String
    let type: String
    let path: String
}

/// Shared path/ID conventions for the official `microsoft/winget-pkgs`
/// GitHub repository, used by both `OfficialManifestLookupProvider` (to
/// confirm an exact ID exists and list its versions) and
/// `WinGetManifestService` (to fetch a specific version's manifest YAML).
///
/// WinGet's manifest path convention: `manifests/<lowercased first letter of
/// the ID>/<Publisher>/<Package>[/<...>]/<Version>/<Id>.installer.yaml`,
/// where each dot-separated segment of the ID becomes one path component.
enum WinGetManifestPath {

    /// Dotted `Publisher.Package[...]` shape, e.g. "7zip.7zip" or
    /// "Microsoft.VisualStudioCode". Reuses the same strictness style as
    /// `Validators`'s patterns: no shell metacharacters, no spaces.
    private static let idPattern = #"^[A-Za-z0-9][A-Za-z0-9+-]*(\.[A-Za-z0-9][A-Za-z0-9+-]*)+$"#

    static func isValidId(_ id: String) -> Bool {
        guard let regex = try? NSRegularExpression(pattern: idPattern) else { return false }
        let range = NSRange(id.startIndex..<id.endIndex, in: id)
        return regex.firstMatch(in: id, range: range) != nil && id.count <= 255
    }

    /// `manifests/<letter>/<Segment1>/<Segment2>/...` — no trailing version.
    static func manifestDirectoryPath(for id: String) -> String? {
        guard isValidId(id) else { return nil }
        guard let firstCharacter = id.first else { return nil }
        let bucket = String(firstCharacter).lowercased()
        let segments = id.split(separator: ".").map(String.init)
        guard !segments.isEmpty else { return nil }
        return (["manifests", bucket] + segments).joined(separator: "/")
    }

    /// GitHub contents API URL listing the entries directly under
    /// `manifests/<letter>/<segments...>` (typically version folders).
    static func contentsAPIURL(for id: String) -> URL? {
        guard let directoryPath = manifestDirectoryPath(for: id) else { return nil }
        return URL(string: "https://api.github.com/repos/microsoft/winget-pkgs/contents/\(directoryPath)")
    }

    /// GitHub contents API URL listing the entries under a specific version
    /// folder, e.g. to find `<Id>.installer.yaml`.
    static func contentsAPIURL(for id: String, version: String) -> URL? {
        guard let directoryPath = manifestDirectoryPath(for: id) else { return nil }
        guard let encodedVersion = version.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else { return nil }
        return URL(string: "https://api.github.com/repos/microsoft/winget-pkgs/contents/\(directoryPath)/\(encodedVersion)")
    }

    /// Raw content URL for a specific manifest file within a version
    /// folder, e.g. `<Id>.installer.yaml` or `<Id>.locale.en-US.yaml`.
    static func rawFileURL(for id: String, version: String, fileName: String) -> URL? {
        guard let directoryPath = manifestDirectoryPath(for: id) else { return nil }
        guard let encodedVersion = version.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else { return nil }
        return URL(string: "https://raw.githubusercontent.com/microsoft/winget-pkgs/master/\(directoryPath)/\(encodedVersion)/\(fileName)")
    }

    /// Splits an ID into `(publisher, packageName)` by convention: the
    /// first dot-separated segment is the publisher, the remainder (joined
    /// back with `.`) is the package name.
    static func splitPublisherAndPackage(id: String) -> (publisher: String, packageName: String) {
        let segments = id.split(separator: ".", maxSplits: 1).map(String.init)
        guard segments.count == 2 else { return (id, id) }
        return (segments[0], segments[1])
    }
}
