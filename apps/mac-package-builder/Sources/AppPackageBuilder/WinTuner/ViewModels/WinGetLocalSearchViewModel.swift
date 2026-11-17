import Foundation

/// Drives the loading/empty/error/results affordances for the Search phase.
/// Same honest-states contract as `NewPackageViewModel`'s `WinGetSearchPhase`, plus
/// two states specific to this module's network-backed providers.
enum WinGetSearchPhase: Equatable {
    case idle
    case loading
    case empty
    case offline
    case rateLimited
    case error(String)
    case results
}

/// Search view model for the WinGet Packager (Local) module. Always queries
/// the official exact-ID manifest lookup provider; additionally queries the
/// optional, unofficial `winget.run` discovery provider only when the caller
/// has opted in via Settings AND the query doesn't already look like a
/// well-formed exact WinGet ID (in which case the official provider alone is
/// authoritative and a second call would be redundant).
@MainActor
final class WinGetLocalSearchViewModel: ObservableObject {
    static let debounceNanoseconds: UInt64 = 350_000_000

    @Published var searchQuery: String = ""
    @Published var results: [WinGetManifestPackage] = []
    @Published var searchPhase: WinGetSearchPhase = .idle
    @Published var highlightedIndex: Int?

    private let officialProvider: WinGetDiscoveryProviding
    private let optionalProvider: WinGetDiscoveryProviding
    /// A `var`, not `let`: the View constructs this ViewModel before
    /// `@EnvironmentObject` is readable (inside `init()`), then assigns the
    /// real `{ settings.enableWinGetRunDiscovery }` closure once the
    /// environment is available (e.g. from `.task`/`.onAppear`).
    var isOptionalProviderEnabled: () -> Bool

    private var searchTask: Task<Void, Never>?
    /// Incremented on every `search()` call so a slow, superseded search can
    /// never overwrite the results of one started after it — same rationale
    /// as `NewPackageViewModel.searchGeneration`.
    private var searchGeneration = 0

    init(
        officialProvider: WinGetDiscoveryProviding = OfficialManifestLookupProvider(),
        optionalProvider: WinGetDiscoveryProviding = WinGetRunDiscoveryProvider(),
        isOptionalProviderEnabled: @escaping () -> Bool
    ) {
        self.officialProvider = officialProvider
        self.optionalProvider = optionalProvider
        self.isOptionalProviderEnabled = isOptionalProviderEnabled
    }

    /// Whether free-text search is actually possible right now for the
    /// current query — used by the View to show the "enable discovery, or
    /// enter the exact ID" hint.
    var looksLikeExactId: Bool {
        WinGetManifestPath.isValidId(searchQuery.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    func search() {
        searchTask?.cancel()
        searchGeneration += 1
        let generation = searchGeneration

        let trimmed = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            searchPhase = .idle
            results = []
            highlightedIndex = nil
            return
        }

        searchPhase = .loading
        let queryIsExactId = WinGetManifestPath.isValidId(trimmed)
        let includeOptionalProvider = isOptionalProviderEnabled() && !queryIsExactId

        searchTask = Task { [officialProvider, optionalProvider] in
            try? await Task.sleep(nanoseconds: Self.debounceNanoseconds)
            guard !Task.isCancelled else { return }

            do {
                var combined = try await officialProvider.search(query: trimmed)
                if includeOptionalProvider {
                    // Best-effort: a failure from the optional provider
                    // should not hide official results that already
                    // succeeded, so it's caught rather than propagated.
                    if let optionalResults = try? await optionalProvider.search(query: trimmed) {
                        let existingIds = Set(combined.map(\.id))
                        combined += optionalResults.filter { !existingIds.contains($0.id) }
                    }
                }
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard generation == self.searchGeneration else { return }
                    self.results = combined
                    self.searchPhase = combined.isEmpty ? .empty : .results
                    self.highlightedIndex = combined.isEmpty ? nil : 0
                }
            } catch {
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard generation == self.searchGeneration else { return }
                    self.results = []
                    self.highlightedIndex = nil
                    self.searchPhase = Self.mapError(error)
                }
            }
        }
    }

    func clearSearch() {
        searchTask?.cancel()
        searchGeneration += 1
        searchQuery = ""
        results = []
        searchPhase = .idle
        highlightedIndex = nil
    }

    func moveHighlight(by delta: Int) {
        guard !results.isEmpty else { return }
        let count = results.count
        let current = highlightedIndex ?? (delta > 0 ? -1 : 0)
        let next = ((current + delta) % count + count) % count
        highlightedIndex = next
    }

    func highlightedResult() -> WinGetManifestPackage? {
        guard let highlightedIndex, results.indices.contains(highlightedIndex) else { return nil }
        return results[highlightedIndex]
    }

    private static func mapError(_ error: Error) -> WinGetSearchPhase {
        switch error {
        case WinGetDiscoveryError.offline:
            return .offline
        case WinGetDiscoveryError.rateLimited:
            return .rateLimited
        case let discoveryError as WinGetDiscoveryError:
            return .error(discoveryError.localizedDescription)
        default:
            return .error(error.localizedDescription)
        }
    }
}
