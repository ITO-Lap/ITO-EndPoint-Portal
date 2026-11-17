import Foundation

/// Concurrent, short-lived cached search across enabled sources. Equivalent
/// package IDs are merged and an authoritative Microsoft result always wins.
final class UnifiedWinGetSearchService {
    struct Result: Equatable { let results: [WinGetSearchResult]; let failures: [WinGetSource: String] }
    private let providers: [WinGetSourceProvider]
    private var cache: [String: (expires: Date, result: Result)] = [:]
    private let cacheTTL: TimeInterval

    init(providers: [WinGetSourceProvider], cacheTTL: TimeInterval = 60) { self.providers = providers; self.cacheTTL = cacheTTL }

    func search(query: String, enabledSources: Set<WinGetSource> = Set(WinGetSource.allCases)) async -> Result {
        let key = "\(query.lowercased())|\(enabledSources.map(\.rawValue).sorted().joined(separator: ","))"
        if let cached = cache[key], cached.expires > Date() { return cached.result }
        var all: [WinGetSearchResult] = []; var failures: [WinGetSource: String] = [:]
        await withTaskGroup(of: (WinGetSource, Swift.Result<[WinGetSearchResult], Error>).self) { group in
            for provider in providers where enabledSources.contains(provider.source) {
                group.addTask {
                    do { return (provider.source, .success(try await provider.search(query: query))) }
                    catch { return (provider.source, .failure(error)) }
                }
            }
            for await (source, result) in group {
                switch result { case .success(let values): all += values; case .failure(let error): failures[source] = error.localizedDescription }
            }
        }
        let merged = Dictionary(grouping: all, by: { $0.package.id }).values.compactMap { matches in
            matches.first(where: { $0.isAuthoritative }) ?? matches.first
        }.sorted { $0.package.name.localizedCaseInsensitiveCompare($1.package.name) == .orderedAscending }
        let result = Result(results: merged, failures: failures)
        cache[key] = (Date().addingTimeInterval(cacheTTL), result)
        return result
    }
}
