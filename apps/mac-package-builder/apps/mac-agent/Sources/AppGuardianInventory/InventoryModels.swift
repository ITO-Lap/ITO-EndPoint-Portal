import Foundation

public enum AppInstallSource: String, Codable, Sendable {
    case systemApplications
    case currentUserApplications
}

public enum CodeSignatureStatus: String, Codable, Sendable {
    case valid
    case invalid
    case unsigned
    case unavailable
}

public struct CodeSignatureInspection: Codable, Equatable, Sendable {
    public let status: CodeSignatureStatus
    public let teamIdentifier: String?

    public init(status: CodeSignatureStatus, teamIdentifier: String?) {
        self.status = status
        self.teamIdentifier = teamIdentifier
    }
}

public struct InstalledApplication: Codable, Equatable, Identifiable, Sendable {
    public var id: String { installPath }

    public let name: String
    public let bundleIdentifier: String
    public let shortVersion: String?
    public let bundleVersion: String?
    public let installPath: String
    public let installSource: AppInstallSource
    public let codeSignature: CodeSignatureInspection
    public let lastModifiedAt: Date?

    public init(
        name: String,
        bundleIdentifier: String,
        shortVersion: String?,
        bundleVersion: String?,
        installPath: String,
        installSource: AppInstallSource,
        codeSignature: CodeSignatureInspection,
        lastModifiedAt: Date?
    ) {
        self.name = name
        self.bundleIdentifier = bundleIdentifier
        self.shortVersion = shortVersion
        self.bundleVersion = bundleVersion
        self.installPath = installPath
        self.installSource = installSource
        self.codeSignature = codeSignature
        self.lastModifiedAt = lastModifiedAt
    }
}

public struct InventoryScanRoot: Sendable {
    public let url: URL
    public let source: AppInstallSource

    public init(url: URL, source: AppInstallSource) {
        self.url = url
        self.source = source
    }

    public static func standard(userHome: URL = FileManager.default.homeDirectoryForCurrentUser) -> [InventoryScanRoot] {
        [
            InventoryScanRoot(url: URL(fileURLWithPath: "/Applications", isDirectory: true), source: .systemApplications),
            InventoryScanRoot(url: userHome.appendingPathComponent("Applications", isDirectory: true), source: .currentUserApplications)
        ]
    }
}

public struct InventoryScanIssue: Codable, Equatable, Sendable {
    public let path: String
    public let message: String

    public init(path: String, message: String) {
        self.path = path
        self.message = message
    }
}

public struct InventoryScanResult: Sendable {
    public let applications: [InstalledApplication]
    public let issues: [InventoryScanIssue]

    public init(applications: [InstalledApplication], issues: [InventoryScanIssue]) {
        self.applications = applications
        self.issues = issues
    }
}