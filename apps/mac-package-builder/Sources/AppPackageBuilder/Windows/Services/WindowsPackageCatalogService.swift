import Foundation

protocol WindowsPackageCatalogServicing {
    func loadAll() -> [WindowsCatalogEntry]
    func save(_ entry: WindowsCatalogEntry)
    func remove(id: UUID)
}

/// Persists the Windows package catalog as a JSON file under Application
/// Support, mirroring `BuildHistoryService`'s load-all/persist-atomic pattern
/// exactly for the Windows WinGet packaging flow.
final class WindowsPackageCatalogService: WindowsPackageCatalogServicing {
    private let fileURL: URL

    init(fileURL: URL? = nil) {
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? FileManager.default.temporaryDirectory
            let dir = base.appendingPathComponent("AppPackageBuilder", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            self.fileURL = dir.appendingPathComponent("windows-catalog.json")
        }
    }

    func loadAll() -> [WindowsCatalogEntry] {
        guard let data = try? Data(contentsOf: fileURL) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([WindowsCatalogEntry].self, from: data)) ?? []
    }

    func save(_ entry: WindowsCatalogEntry) {
        var all = loadAll()
        all.removeAll { $0.id == entry.id }
        all.insert(entry, at: 0)
        persist(all)
    }

    func remove(id: UUID) {
        var all = loadAll()
        all.removeAll { $0.id == id }
        persist(all)
    }

    private func persist(_ entries: [WindowsCatalogEntry]) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(entries) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
