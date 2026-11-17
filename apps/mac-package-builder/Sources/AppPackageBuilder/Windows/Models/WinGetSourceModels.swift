import Foundation

/// A normalized source label. Discovery sources may help find a package, but
/// only the Microsoft Community/Store providers are authoritative for a build.
enum WinGetSource: String, Codable, CaseIterable, Identifiable, Hashable {
    case microsoftCommunity = "winget"
    case microsoftStore = "msstore"
    case wingetRun = "winget.run"
    case winstall
    case privateRepository

    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .microsoftCommunity: return "Microsoft WinGet"
        case .microsoftStore: return "Microsoft Store"
        case .wingetRun: return "winget.run"
        case .winstall: return "winstall"
        case .privateRepository: return "Private source"
        }
    }
    var isAuthoritative: Bool { self == .microsoftCommunity || self == .microsoftStore }
}

struct WinGetSourceStatus: Equatable {
    enum State: Equatable { case ready, unavailable(String), requiresSignIn(String) }
    let source: WinGetSource
    let state: State
}

struct WinGetSearchResult: Identifiable, Equatable {
    let package: WinGetPackage
    let provider: WinGetSource
    let isAuthoritative: Bool
    var id: String { package.id }
}

struct WinGetPackageVersion: Identifiable, Equatable, Codable {
    let version: String
    let releaseDate: Date?
    let isStable: Bool
    var id: String { version }
}

struct WinGetInstallerCandidate: Identifiable, Equatable, Codable {
    let packageID: String
    let version: String
    let type: WinGetPackageDetail.InstallerType
    let architecture: WinGetPackageDetail.Architecture
    let scope: WinGetPackageDetail.InstallerScope
    let locale: String?
    let url: URL?
    let sha256: String?
    let productCode: String?
    let upgradeCode: String?
    let installSwitch: String?
    let uninstallSwitch: String?
    let originalFilename: String?
    var id: String { "\(packageID)|\(version)|\(type.rawValue)|\(architecture.rawValue)|\(locale ?? "")" }
}
