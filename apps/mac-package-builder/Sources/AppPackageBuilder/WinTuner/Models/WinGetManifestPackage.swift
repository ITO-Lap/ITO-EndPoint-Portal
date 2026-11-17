import Foundation

/// A single search-result row, sourced either from an exact-ID manifest
/// lookup against `microsoft/winget-pkgs` (source `"winget"`) or, only if
/// the user has opted in, the unofficial `winget.run` discovery index
/// (source `"winget.run"`).
struct WinGetManifestPackage: Identifiable, Codable, Equatable {
    let id: String
    let name: String
    let publisher: String
    let latestVersion: String
    let source: String
}
