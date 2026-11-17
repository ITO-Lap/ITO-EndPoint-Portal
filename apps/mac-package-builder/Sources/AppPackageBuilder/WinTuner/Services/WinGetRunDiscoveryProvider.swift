import Foundation

/// **Unofficial, third-party discovery index (winget.run).** This is NOT a
/// Microsoft/WinGet-affiliated service — it is a community-run convenience
/// index used ONLY for free-text name/publisher search discovery. It must
/// NEVER be treated as a source of installer URLs or SHA-256 hashes; those
/// always come from the official `microsoft/winget-pkgs` manifest fetch via
/// `WinGetManifestService`/`OfficialManifestLookupProvider`.
///
/// This class is OFF by default. The on/off toggle itself lives in a
/// Settings flag wired up by a later agent — callers of this type MUST gate
/// its use behind that explicit opt-in and must label its results as
/// "unofficial" in the UI.
///
/// Response-shape caveat: `api.winget.run`'s exact JSON schema is not
/// something this implementation could verify against a live, documented
/// contract at write time. Decoding here is deliberately defensive
/// (optional fields, tolerant of missing keys) so an unexpected shape
/// degrades to fewer/no results rather than a crash — but the field mapping
/// below is a best-effort guess based on the endpoint's commonly-referenced
/// shape (`{"Packages": [{"Id": ..., "Latest": {"Name":, "Publisher":,
/// "Version":}}]}`), not a confirmed-current contract. Treat with
/// proportionate skepticism and re-verify if this provider is ever enabled
/// for real use.
final class WinGetRunDiscoveryProvider: WinGetDiscoveryProviding {
    private let urlSession: URLSession

    init(urlSession: URLSession = .shared) {
        self.urlSession = urlSession
    }

    func search(query: String) async throws -> [WinGetManifestPackage] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        guard let encodedQuery = trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return [] }
        guard let url = URL(string: "https://api.winget.run/v2/packages?query=\(encodedQuery)") else { return [] }

        let request = URLRequest(url: url)
        let (data, response) = try await fetch(request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw WinGetDiscoveryError.other("Unexpected response from winget.run.")
        }
        if httpResponse.statusCode == 404 {
            return []
        }
        if httpResponse.statusCode == 403 || httpResponse.statusCode == 429 {
            throw WinGetDiscoveryError.rateLimited
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw WinGetDiscoveryError.other("winget.run returned status \(httpResponse.statusCode).")
        }

        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return []
        }
        guard let rawPackages = root["Packages"] as? [[String: Any]] else {
            return []
        }

        return rawPackages.compactMap { entry -> WinGetManifestPackage? in
            guard let id = entry["Id"] as? String else { return nil }
            let latest = entry["Latest"] as? [String: Any]
            let name = (latest?["Name"] as? String) ?? id
            let publisher = (latest?["Publisher"] as? String) ?? WinGetManifestPath.splitPublisherAndPackage(id: id).publisher
            let version = (latest?["Version"] as? String) ?? ""
            return WinGetManifestPackage(
                id: id,
                name: name,
                publisher: publisher,
                latestVersion: version,
                source: "winget.run"
            )
        }
    }

    private func fetch(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await urlSession.data(for: request)
        } catch is URLError {
            throw WinGetDiscoveryError.offline
        } catch {
            throw WinGetDiscoveryError.other(error.localizedDescription)
        }
    }
}
