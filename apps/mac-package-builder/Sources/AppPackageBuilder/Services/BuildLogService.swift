import Foundation
import OSLog

struct LogLine: Identifiable, Equatable {
    let id = UUID()
    let timestamp: Date
    let text: String

    var formatted: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return "[\(formatter.string(from: timestamp))] \(text)"
    }
}

/// Live build console backing store. Mirrors every line into `OSLog` (the
/// canonical application log) while keeping an in-memory buffer the UI can
/// render immediately, and can export the full transcript to a file.
@MainActor
final class BuildLogService: ObservableObject {
    @Published private(set) var lines: [LogLine] = []
    private let logger = Logger(subsystem: "com.AKVERMA.AppPackageBuilder", category: "Build")

    func append(_ text: String) {
        lines.append(LogLine(timestamp: Date(), text: text))
        logger.info("\(text, privacy: .public)")
    }

    func clear() {
        lines.removeAll()
    }

    var fullTranscript: String {
        lines.map(\.formatted).joined(separator: "\n")
    }

    @discardableResult
    func export(to url: URL) throws -> URL {
        try fullTranscript.write(to: url, atomically: true, encoding: .utf8)
        return url
    }
}
