import Foundation

/// A single row returned from a WinGet catalog search, used to populate the
/// "Select Application" step before full manifest metadata is fetched.
/// Mirrors `BrewSearchResult`'s role for the Homebrew flow.
struct WinGetPackage: Identifiable, Codable, Equatable {
    /// Official WinGet identifier when returned by a source. The fallback
    /// preserves compatibility with older agents that only supplied a name.
    let packageID: String?
    var id: String { packageID ?? "\(source):\(name)" }
    let name: String
    let publisher: String
    let latestVersion: String
    let description: String?
    let source: String

    init(name: String, publisher: String, latestVersion: String, description: String?, source: String, packageID: String? = nil) {
        self.name = name; self.publisher = publisher; self.latestVersion = latestVersion; self.description = description; self.source = source; self.packageID = packageID
    }

    enum CodingKeys: String, CodingKey { case name, publisher, latestVersion, description, source, packageID, packageId, id }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        name = try values.decode(String.self, forKey: .name)
        publisher = try values.decode(String.self, forKey: .publisher)
        latestVersion = try values.decode(String.self, forKey: .latestVersion)
        description = try values.decodeIfPresent(String.self, forKey: .description)
        source = try values.decode(String.self, forKey: .source)
        packageID = try values.decodeIfPresent(String.self, forKey: .packageID) ?? values.decodeIfPresent(String.self, forKey: .packageId) ?? values.decodeIfPresent(String.self, forKey: .id)
    }
    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(name, forKey: .name); try values.encode(publisher, forKey: .publisher); try values.encode(latestVersion, forKey: .latestVersion); try values.encodeIfPresent(description, forKey: .description); try values.encode(source, forKey: .source); try values.encodeIfPresent(packageID, forKey: .packageID)
    }
}

/// Full manifest metadata for one WinGet package, fetched via `winget show`
/// on the agent once a specific package/version is selected. Everything here
/// is either a validated primitive or a closed enum before it is ever used to
/// drive a download or packaging request — see `WinGetValidators`.
struct WinGetPackageDetail: Identifiable, Codable, Equatable {
    var id: String { "\(source):\(name)" }
    let name: String
    let publisher: String
    let latestVersion: String
    let description: String?
    let source: String

    var installerType: InstallerType
    var architecture: Architecture
    var scope: InstallerScope
    var installerURL: URL?
    var sha256: String?
    var supportsOfflineDownload: Bool
    var dependencies: [String]
    var availableVersions: [String]
    var locale: String?

    /// Installer packaging format, as reported by the WinGet manifest.
    enum InstallerType: String, Codable, CaseIterable, Identifiable {
        case msi
        case exe
        case msix
        case msixBundle = "msixbundle"
        case other

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .msi: return "MSI"
            case .exe: return "EXE"
            case .msix: return "MSIX"
            case .msixBundle: return "MSIX Bundle"
            case .other: return "Other"
            }
        }
    }

    /// Target CPU architecture for the installer.
    enum Architecture: String, Codable, CaseIterable, Identifiable {
        case x86
        case x64
        case arm64

        var id: String { rawValue }
        var displayName: String { rawValue }
    }

    /// Whether the installer targets a per-user or per-machine install.
    enum InstallerScope: String, Codable, CaseIterable, Identifiable {
        case user
        case machine

        var id: String { rawValue }
        var displayName: String { self == .user ? "User" : "Machine" }
    }
}
