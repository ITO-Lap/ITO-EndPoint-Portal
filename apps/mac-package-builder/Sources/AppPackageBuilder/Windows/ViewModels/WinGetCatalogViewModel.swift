import Foundation

/// Filters applied client-side to narrow a WinGet catalog search beyond the
/// free-text query. `RemoteBuildAgentServicing.searchPackages` only takes a
/// query + source today; the rest are applied to the returned rows here (and
/// to the fetched detail once a package is selected) until the agent-side
/// search endpoint grows matching parameters.
struct WinGetSearchFilters: Equatable {
    var exactId: String = ""
    var publisher: String = ""
    var source: String = ""
    var version: String = ""
    var architecture: WinGetPackageDetail.Architecture?
    var installerType: WinGetPackageDetail.InstallerType?
    var scope: WinGetPackageDetail.InstallerScope?
    var locale: String = ""

    var isEmpty: Bool {
        exactId.isEmpty && publisher.isEmpty && source.isEmpty && version.isEmpty
            && architecture == nil && installerType == nil && scope == nil && locale.isEmpty
    }
}

/// Debounced, cancellable WinGet catalog search — the pattern is copied
/// exactly from `NewPackageViewModel.search()`: a 300ms debounce, a
/// generation counter so a slow stale search can never clobber a fresher
/// one's results, and cancellation of the prior in-flight `Task` before
/// starting a new one.
@MainActor
final class WinGetCatalogViewModel: ObservableObject {
    static let searchDebounceNanoseconds: UInt64 = 300_000_000

    @Published var searchQuery: String = ""
    @Published var filters = WinGetSearchFilters()
    @Published var results: [WinGetPackage] = []
    @Published var phase: RemoteJobPhase = .idle
    @Published var selectedDetail: WinGetPackageDetail?
    @Published var detailPhase: RemoteJobPhase = .idle

    private let client: RemoteBuildAgentServicing
    private var searchTask: Task<Void, Never>?
    private var detailTask: Task<Void, Never>?
    private var searchGeneration = 0

    /// `client` overrides everything (used by tests/previews with a scripted
    /// `RemoteBuildAgentServicing`). Otherwise the client is resolved from
    /// `connectionStore`: a real `WindowsBuildAgentClient` when a Windows
    /// Build Agent is configured, or `DemoBuildAgentClient()` so the catalog
    /// stays demoable with no agent configured.
    init(connectionStore: WindowsAgentConnectionStore? = nil, client: RemoteBuildAgentServicing? = nil) {
        self.client = client ?? (connectionStore ?? WindowsAgentConnectionStore()).makeClient()
    }

    func checkAgentReachable() {
        Task {
            do {
                _ = try await client.health()
            } catch {
                phase = .disconnected
            }
        }
    }

    func search() {
        searchTask?.cancel()
        searchGeneration += 1
        let generation = searchGeneration

        let trimmed = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || !filters.isEmpty else {
            phase = .idle
            results = []
            return
        }

        phase = .loading
        let sourceFilter = filters.source.isEmpty ? nil : filters.source
        searchTask = Task { [client] in
            try? await Task.sleep(nanoseconds: Self.searchDebounceNanoseconds)
            guard !Task.isCancelled else { return }

            do {
                let effectiveQuery = trimmed.isEmpty ? filters.exactId : trimmed
                let rawResults = try await client.searchPackages(query: effectiveQuery, source: sourceFilter)
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard generation == self.searchGeneration else { return }
                    let filtered = self.applyLocalFilters(rawResults)
                    self.results = filtered
                    self.phase = filtered.isEmpty ? .empty : .idle
                }
            } catch {
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard generation == self.searchGeneration else { return }
                    self.results = []
                    self.phase = .disconnected
                }
            }
        }
    }

    private func applyLocalFilters(_ packages: [WinGetPackage]) -> [WinGetPackage] {
        packages.filter { package in
            (filters.publisher.isEmpty || package.publisher.localizedCaseInsensitiveContains(filters.publisher))
                && (filters.version.isEmpty || package.latestVersion == filters.version)
                && (filters.exactId.isEmpty || package.name.localizedCaseInsensitiveCompare(filters.exactId) == .orderedSame)
        }
    }

    func selectPackage(_ package: WinGetPackage) {
        detailTask?.cancel()
        detailPhase = .loading
        selectedDetail = nil
        detailTask = Task { [client] in
            do {
                let detail = try await client.packageDetail(id: package.id)
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    self.selectedDetail = detail
                    self.detailPhase = .idle
                }
            } catch {
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    self.detailPhase = .error(error.localizedDescription)
                }
            }
        }
    }

    func clearSearch() {
        searchTask?.cancel()
        searchGeneration += 1
        searchQuery = ""
        results = []
        phase = .idle
        selectedDetail = nil
        detailPhase = .idle
    }
}
