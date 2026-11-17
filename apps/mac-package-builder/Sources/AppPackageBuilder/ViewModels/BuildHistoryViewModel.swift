import Foundation
import AppKit

@MainActor
final class BuildHistoryViewModel: ObservableObject {
    @Published var records: [BuildHistoryRecord] = []
    @Published var pendingDeletion: BuildHistoryRecord?

    private let historyService: BuildHistoryServicing

    init(historyService: BuildHistoryServicing = BuildHistoryService()) {
        self.historyService = historyService
        reload()
    }

    func reload() {
        records = historyService.loadAll()
    }

    func removeRecordOnly(_ record: BuildHistoryRecord) {
        historyService.remove(id: record.id)
        reload()
    }

    func removeRecordAndFiles(_ record: BuildHistoryRecord) {
        let dir = (record.outputPath as NSString).deletingLastPathComponent
        if let resolved = try? PathValidator.canonicalize(dir) {
            try? FileManager.default.removeItem(at: resolved.appendingPathComponent((record.outputPath as NSString).lastPathComponent))
        }
        historyService.remove(id: record.id)
        reload()
    }

    func reveal(_ record: BuildHistoryRecord) {
        NSWorkspace.shared.selectFile(record.outputPath, inFileViewerRootedAtPath: "")
    }
}
