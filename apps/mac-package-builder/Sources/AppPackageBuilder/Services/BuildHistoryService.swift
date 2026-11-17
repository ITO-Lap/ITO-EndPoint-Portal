import Foundation

protocol BuildHistoryServicing {
    func loadAll() -> [BuildHistoryRecord]
    func save(_ record: BuildHistoryRecord)
    func remove(id: UUID)
}

/// Persists build history as a JSON file under Application Support.
/// Deliberately simple (no database dependency) — history is small,
/// append-mostly, and read once at launch.
final class BuildHistoryService: BuildHistoryServicing {
    private let fileURL: URL

    init(fileURL: URL? = nil) {
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? FileManager.default.temporaryDirectory
            let dir = base.appendingPathComponent("AppPackageBuilder", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            self.fileURL = dir.appendingPathComponent("history.json")
        }
    }

    func loadAll() -> [BuildHistoryRecord] {
        guard let data = try? Data(contentsOf: fileURL) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([BuildHistoryRecord].self, from: data)) ?? []
    }

    func save(_ record: BuildHistoryRecord) {
        var all = loadAll()
        all.removeAll { $0.id == record.id }
        all.insert(record, at: 0)
        persist(all)
    }

    func remove(id: UUID) {
        var all = loadAll()
        all.removeAll { $0.id == id }
        persist(all)
    }

    private func persist(_ records: [BuildHistoryRecord]) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(records) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
