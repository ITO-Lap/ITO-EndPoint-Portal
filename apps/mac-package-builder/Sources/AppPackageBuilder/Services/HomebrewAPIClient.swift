import Foundation

/// Brew-free metadata source used when Homebrew isn't installed on this Mac.
/// Reads Homebrew's public JSON API (https://formulae.brew.sh/api), which
/// serves the same cask/formula records `brew info --json=v2` prints, so the
/// existing `CaskJSON`/`FormulaJSON` decoding is reused unchanged.
///
/// Scope of the fallback: cask + formula search and info. The formula index is
/// ~30 MB, so it is downloaded in the background the first time and formula
/// results appear once it is cached (cask results are never delayed by it).
/// Third-party taps (`user/tap/name`) aren't in the public API and report
/// "not found".
final class HomebrewAPIClient {
    typealias Fetch = (URLRequest) async throws -> (Data, URLResponse)

    static let displayVersion = "Homebrew online catalog (formulae.brew.sh)"

    private struct CaskIndexEntry: Decodable {
        let token: String
        let name: [String]?
    }

    private struct FormulaIndexEntry: Decodable {
        let name: String
    }

    private let baseURL: URL
    private let cacheFile: URL
    private let formulaCacheFile: URL
    private let prefetchLock = NSLock()
    private var formulaPrefetch: Task<Void, Never>?
    private let cacheMaxAge: TimeInterval
    private let fetch: Fetch
    private let maxResults = 50

    init(
        baseURL: URL = URL(string: "https://formulae.brew.sh/api")!,
        cacheDirectory: URL? = nil,
        cacheMaxAge: TimeInterval = 24 * 3600,
        fetch: @escaping Fetch = { request in try await URLSession.shared.data(for: request) }
    ) {
        self.baseURL = baseURL
        let dir = cacheDirectory ?? AppEnvironment.supportDirectory.appendingPathComponent("cache", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        self.cacheFile = dir.appendingPathComponent("cask-index.json")
        self.formulaCacheFile = dir.appendingPathComponent("formula-index.json")
        self.cacheMaxAge = cacheMaxAge
        self.fetch = fetch
    }

    // MARK: Search

    func searchCasks(query: String) async throws -> [BrewSearchResult] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return [] }
        let index = try await loadCaskIndex()

        var scored: [(score: Int, result: BrewSearchResult)] = []
        for entry in index where Validators.isValidToken(entry.token) {
            let token = entry.token.lowercased()
            let names = (entry.name ?? []).map { $0.lowercased() }
            let score: Int
            if token == needle || names.contains(needle) { score = 0 }
            else if token.hasPrefix(needle) || names.contains(where: { $0.hasPrefix(needle) }) { score = 1 }
            else if token.contains(needle) || names.contains(where: { $0.contains(needle) }) { score = 2 }
            else { continue }
            scored.append((score, BrewSearchResult(token: entry.token, name: entry.name?.first ?? entry.token, kind: .cask)))
        }
        return scored
            .sorted { ($0.score, $0.result.token.count, $0.result.token) < ($1.score, $1.result.token.count, $1.result.token) }
            .prefix(maxResults)
            .map(\.result)
    }

    /// Formula names matching `query`. Returns `[]` while the large index is
    /// still being downloaded (a background fetch is started), never an error.
    func searchFormulae(query: String) async -> [BrewSearchResult] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return [] }
        guard let names = cachedFormulaNames() else {
            startFormulaPrefetch()
            return []
        }
        let ranked = names.filter { Validators.isValidToken($0) && $0.lowercased().contains(needle) }
            .map { name -> (Int, String) in
                let lower = name.lowercased()
                return (lower == needle ? 0 : lower.hasPrefix(needle) ? 1 : 2, name)
            }
            .sorted { ($0.0, $0.1.count, $0.1) < ($1.0, $1.1.count, $1.1) }
            .prefix(maxResults)
        return ranked.map { BrewSearchResult(token: $0.1, name: $0.1, kind: .formula) }
    }

    private func cachedFormulaNames() -> [String]? {
        let modified = (try? FileManager.default.attributesOfItem(atPath: formulaCacheFile.path))?[.modificationDate] as? Date
        guard let data = try? Data(contentsOf: formulaCacheFile),
              let entries = try? JSONDecoder().decode([FormulaIndexEntry].self, from: data) else { return nil }
        // A stale index is still useful; refresh it quietly in the background.
        if let modified, Date().timeIntervalSince(modified) >= cacheMaxAge { startFormulaPrefetch() }
        return entries.map(\.name)
    }

    private func startFormulaPrefetch() {
        prefetchLock.lock()
        defer { prefetchLock.unlock() }
        guard formulaPrefetch == nil else { return }
        formulaPrefetch = Task.detached(priority: .utility) { [self] in
            defer { clearPrefetch() }
            do {
                let data = try await get(baseURL.appendingPathComponent("formula.json"))
                // Keep only names so the on-disk cache stays small and fast to decode.
                let entries = try JSONDecoder().decode([FormulaIndexEntry].self, from: data)
                let slim = try JSONEncoder().encode(entries.map { ["name": $0.name] })
                try slim.write(to: formulaCacheFile, options: .atomic)
            } catch {
                AppLog.warning("Formula index prefetch failed: \(error.localizedDescription)")
            }
        }
    }

    private func clearPrefetch() {
        prefetchLock.lock(); formulaPrefetch = nil; prefetchLock.unlock()
    }

    private func currentPrefetch() -> Task<Void, Never>? {
        prefetchLock.lock(); defer { prefetchLock.unlock() }
        return formulaPrefetch
    }

    /// Test hook: waits for an in-flight background index download.
    func waitForFormulaPrefetch() async {
        await currentPrefetch()?.value
    }

    private func loadCaskIndex() async throws -> [CaskIndexEntry] {
        let decoder = JSONDecoder()
        let attributes = try? FileManager.default.attributesOfItem(atPath: cacheFile.path)
        let modified = attributes?[.modificationDate] as? Date
        let cached = try? Data(contentsOf: cacheFile)

        if let cached, let modified, Date().timeIntervalSince(modified) < cacheMaxAge,
           let entries = try? decoder.decode([CaskIndexEntry].self, from: cached) {
            return entries
        }
        do {
            let data = try await get(baseURL.appendingPathComponent("cask.json"))
            let entries = try decoder.decode([CaskIndexEntry].self, from: data)
            try? data.write(to: cacheFile, options: .atomic)
            return entries
        } catch {
            // Stale cache beats no results when the network is down.
            if let cached, let entries = try? decoder.decode([CaskIndexEntry].self, from: cached) {
                AppLog.warning("Using stale cask index: \(error.localizedDescription)")
                return entries
            }
            throw error
        }
    }

    // MARK: Info

    func caskInfo(token: String) async throws -> CaskJSON {
        let data = try await get(try recordURL(kind: "cask", token: token), notFoundToken: token)
        do { return try JSONDecoder().decode(CaskJSON.self, from: data) }
        catch { throw HomebrewServiceError.decodingFailed(error.localizedDescription) }
    }

    func formulaInfo(token: String) async throws -> FormulaJSON {
        let data = try await get(try recordURL(kind: "formula", token: token), notFoundToken: token)
        do { return try JSONDecoder().decode(FormulaJSON.self, from: data) }
        catch { throw HomebrewServiceError.decodingFailed(error.localizedDescription) }
    }

    private func recordURL(kind: String, token: String) throws -> URL {
        guard Validators.isValidToken(token) else { throw HomebrewServiceError.invalidToken(token) }
        guard !token.contains("/") else { throw HomebrewServiceError.notFound(token) }
        return baseURL.appendingPathComponent(kind).appendingPathComponent("\(token).json")
    }

    // MARK: Networking

    private func get(_ url: URL, notFoundToken: String? = nil) async throws -> Data {
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        request.setValue("AppPackageBuilder/\(AppEnvironment.versionString)", forHTTPHeaderField: "User-Agent")
        do {
            let (data, response) = try await fetch(request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 200
            if status == 404, let notFoundToken { throw HomebrewServiceError.notFound(notFoundToken) }
            guard (200..<300).contains(status) else { throw HomebrewServiceError.networkUnavailable("HTTP \(status)") }
            return data
        } catch let error as HomebrewServiceError {
            throw error
        } catch {
            throw HomebrewServiceError.networkUnavailable(error.localizedDescription)
        }
    }
}
