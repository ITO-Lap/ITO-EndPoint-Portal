import Foundation

/// UI-facing catalog state for the Windows builder. It preserves the same
/// debounce/cancellation guarantees as the existing macOS/Homebrew search,
/// while searching enabled providers concurrently.
@MainActor
final class UnifiedWinGetCatalogViewModel: ObservableObject {
    static let searchDebounceNanoseconds: UInt64 = 300_000_000
    @Published var searchQuery = ""
    @Published var enabledSources: Set<WinGetSource> = [.microsoftCommunity, .microsoftStore]
    @Published private(set) var results: [WinGetSearchResult] = []
    @Published private(set) var partialFailures: [WinGetSource: String] = [:]
    @Published var phase: RemoteJobPhase = .idle
    @Published var selectedDetail: WinGetPackageDetail?
    @Published var detailPhase: RemoteJobPhase = .idle

    private let service: UnifiedWinGetSearchService
    private let officialProvider: WinGetSourceProvider
    private var task: Task<Void, Never>?
    private var generation = 0

    init(client: RemoteBuildAgentServicing, additionalProviders: [WinGetSourceProvider] = []) {
        let official = MicrosoftWinGetSourceProvider(client: client)
        self.officialProvider = official
        self.service = UnifiedWinGetSearchService(providers: [official, MicrosoftWinGetSourceProvider(client: client, source: .microsoftStore)] + additionalProviders)
    }

    func search() {
        task?.cancel(); generation += 1
        let generation = generation
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { results = []; partialFailures = [:]; phase = .idle; return }
        phase = .loading
        let sources = enabledSources
        task = Task { [service] in
            try? await Task.sleep(nanoseconds: Self.searchDebounceNanoseconds)
            guard !Task.isCancelled else { return }
            let response = await service.search(query: query, enabledSources: sources)
            guard !Task.isCancelled else { return }
            guard generation == self.generation else { return }
            results = response.results; partialFailures = response.failures
            phase = response.results.isEmpty ? .empty : .idle
        }
    }

    func select(_ result: WinGetSearchResult) {
        detailPhase = .loading; selectedDetail = nil
        Task {
            do {
                // Discovery metadata is never used as package authority.
                let detail = try await officialProvider.packageDetails(packageID: result.package.id)
                selectedDetail = detail; detailPhase = .idle
            } catch { detailPhase = .error(error.localizedDescription) }
        }
    }

    func checkAgentReachable() {
        Task { let status = await officialProvider.healthCheck(); if case .unavailable = status.state { phase = .disconnected } }
    }
}
