import Foundation

/// Read-only-ish view of packaged Windows applications, backed by
/// `WindowsPackageCatalogService`'s JSON persistence under Application
/// Support (mirrors `BuildHistoryService`'s load-all/persist-atomic
/// pattern). This ViewModel is persistence-backed, not agent-backed, so it
/// has no `RemoteBuildAgentServicing` dependency to resolve.
@MainActor
final class WindowsPackageCatalogViewModel: ObservableObject {
    @Published var entries: [WindowsCatalogEntry] = []
    @Published var phase: RemoteJobPhase = .empty

    private let catalogService: WindowsPackageCatalogServicing

    init(catalogService: WindowsPackageCatalogServicing = WindowsPackageCatalogService()) {
        self.catalogService = catalogService
    }

    func load() {
        phase = .loading
        entries = catalogService.loadAll()
        phase = entries.isEmpty ? .empty : .idle
    }

    func save(_ entry: WindowsCatalogEntry) {
        catalogService.save(entry)
        load()
    }

    func remove(id: UUID) {
        catalogService.remove(id: id)
        load()
    }
}
