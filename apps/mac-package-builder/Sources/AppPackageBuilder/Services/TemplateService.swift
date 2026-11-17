import Foundation

protocol TemplateServicing {
    func loadAll() -> [PackageTemplate]
    func save(_ template: PackageTemplate)
    func remove(id: UUID)
}

/// Persists user-saved templates as JSON alongside the built-in samples,
/// which are always merged in at read time (and never persisted/removed).
final class TemplateService: TemplateServicing {
    private let fileURL: URL

    init(fileURL: URL? = nil) {
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? FileManager.default.temporaryDirectory
            let dir = base.appendingPathComponent("AppPackageBuilder", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            self.fileURL = dir.appendingPathComponent("templates.json")
        }
    }

    func loadAll() -> [PackageTemplate] {
        PackageTemplate.builtInSamples() + loadUserTemplates()
    }

    private func loadUserTemplates() -> [PackageTemplate] {
        guard let data = try? Data(contentsOf: fileURL) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([PackageTemplate].self, from: data)) ?? []
    }

    func save(_ template: PackageTemplate) {
        var all = loadUserTemplates()
        all.removeAll { $0.id == template.id }
        all.append(template)
        persist(all)
    }

    func remove(id: UUID) {
        var all = loadUserTemplates()
        all.removeAll { $0.id == id }
        persist(all)
    }

    private func persist(_ templates: [PackageTemplate]) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(templates) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
