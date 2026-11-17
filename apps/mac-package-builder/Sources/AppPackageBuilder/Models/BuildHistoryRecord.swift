import Foundation

enum BuildResult: String, Codable {
    case success
    case failed
    case cancelled
}

struct BuildHistoryRecord: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var applicationName: String
    var version: String
    var buildDate: Date
    var packagingMode: PackagingMode
    var result: BuildResult
    var outputPath: String
    var isSigned: Bool
    var durationSeconds: Double
    var logPath: String?
    var configuration: PackageConfiguration
}
