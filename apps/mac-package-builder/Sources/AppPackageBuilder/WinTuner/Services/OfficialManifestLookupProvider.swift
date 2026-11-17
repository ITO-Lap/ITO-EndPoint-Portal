import Foundation

/// Exact-ID-only lookup against the official `microsoft/winget-pkgs`
/// GitHub repository. There is no first-party WinGet search REST API, so
/// this provider does not guess or fuzzy-match: if `query` doesn't look
/// like a well-formed `Publisher.Package` WinGet ID, it returns `[]`
/// immediately without making a network call.
final class OfficialManifestLookupProvider: WinGetDiscoveryProviding {
    private let urlSession: URLSession

    init(urlSession: URLSession = .shared) {
        self.urlSession = urlSession
    }

    func search(query: String) async throws -> [WinGetManifestPackage] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard WinGetManifestPath.isValidId(trimmed) else { return [] }
        guard let url = WinGetManifestPath.contentsAPIURL(for: trimmed) else { return [] }

        let request = URLRequest(url: url)
        let (data, response) = try await fetch(request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw WinGetDiscoveryError.other("Unexpected response from GitHub.")
        }

        if httpResponse.statusCode == 404 {
            return []
        }
        if httpResponse.statusCode == 403 {
            throw WinGetDiscoveryError.rateLimited
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw WinGetDiscoveryError.other("GitHub returned status \(httpResponse.statusCode).")
        }

        let entries: [GitHubContentsEntry]
        do {
            entries = try JSONDecoder().decode([GitHubContentsEntry].self, from: data)
        } catch {
            throw WinGetDiscoveryError.other("Could not parse the manifest directory listing.")
        }

        // Version folders sort lexicographically most of the time for
        // WinGet's versioning scheme; this is a best-effort "latest" pick,
        // not an authoritative semantic-version comparison.
        let versionFolders = entries.filter { $0.type == "dir" }.map(\.name).sorted()
        guard let latestVersion = versionFolders.last else { return [] }

        let (publisher, packageName) = WinGetManifestPath.splitPublisherAndPackage(id: trimmed)
        let package = WinGetManifestPackage(
            id: trimmed,
            name: packageName,
            publisher: publisher,
            latestVersion: latestVersion,
            source: "winget"
        )
        return [package]
    }

    private func fetch(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await urlSession.data(for: request)
        } catch let error as URLError {
            throw WinGetDiscoveryError.offline
        } catch {
            throw WinGetDiscoveryError.other(error.localizedDescription)
        }
    }
}
