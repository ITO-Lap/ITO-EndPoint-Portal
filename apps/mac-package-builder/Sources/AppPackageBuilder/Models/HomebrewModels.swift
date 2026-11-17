import Foundation

/// Whether a Homebrew package is a cask (prebuilt .app/.pkg/.dmg) or a formula
/// (built from source / bottled CLI tool, may declare a launchd service).
enum PackageKind: String, Codable, CaseIterable, Identifiable {
    case cask
    case formula

    var id: String { rawValue }
    var displayName: String { self == .cask ? "Cask" : "Formula" }
}

/// A single row returned from a Homebrew search, used to populate the
/// "Select Application" results list before full metadata is fetched.
struct BrewSearchResult: Identifiable, Hashable {
    var id: String { "\(kind.rawValue):\(token)" }
    let token: String
    let name: String
    let kind: PackageKind
}

/// Normalized metadata for a cask or formula, decoded from `brew info --json=v2`.
/// This intentionally exposes only the fields the app needs — brew's JSON schema
/// has many more fields we don't parse, and we never rely on `grep`-based scraping.
struct BrewPackageInfo: Identifiable, Hashable {
    var id: String { "\(kind.rawValue):\(token)" }
    let token: String
    let name: String
    let kind: PackageKind
    let description: String?
    let homepage: String?
    let version: String
    let sourceURL: String?
    let sha256: String?
    let declaresService: Bool
    let hasArmVariant: Bool
    let hasIntelVariant: Bool
    let artifactAppNames: [String]
}

// MARK: - brew info --json=v2 decoding (cask)

struct BrewInfoV2Response: Decodable {
    let casks: [CaskJSON]?
    let formulae: [FormulaJSON]?
}

struct CaskJSON: Decodable {
    let token: String
    let name: [String]?
    let desc: String?
    let homepage: String?
    let version: String?
    let sha256: String?
    let url: String?
    let artifacts: [[String: AnyDecodableValue]]?
    let depends_on: DependsOnJSON?

    var displayName: String { name?.first ?? token }

    var appArtifactNames: [String] {
        guard let artifacts else { return [] }
        var names: [String] = []
        for artifact in artifacts {
            if let appValue = artifact["app"], case .array(let items) = appValue {
                for item in items {
                    if case .string(let s) = item { names.append(s) }
                }
            }
        }
        return names
    }
}

struct DependsOnJSON: Decodable {
    let arch: [[String: AnyDecodableValue]]?
}

// MARK: - brew info --json=v2 decoding (formula)

struct FormulaJSON: Decodable {
    let name: String
    let full_name: String?
    let desc: String?
    let homepage: String?
    let versions: FormulaVersionsJSON?
    let urls: FormulaURLsJSON?
    let service: AnyDecodableValue?

    var declaresService: Bool {
        guard let service else { return false }
        if case .null = service { return false }
        return true
    }
}

struct FormulaVersionsJSON: Decodable {
    let stable: String?
}

struct FormulaURLsJSON: Decodable {
    let stable: FormulaURLEntryJSON?
}

struct FormulaURLEntryJSON: Decodable {
    let url: String?
    let checksum: String?
}

/// Minimal `Decodable` box for the handful of loosely-typed brew JSON fields
/// (artifacts, depends_on.arch, service) so we avoid brittle `Any` casts or
/// scraping JSON text with `grep`, while still not needing a full schema.
enum AnyDecodableValue: Decodable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case array([AnyDecodableValue])
    case object([String: AnyDecodableValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let v = try? container.decode(Bool.self) {
            self = .bool(v)
        } else if let v = try? container.decode(Double.self) {
            self = .number(v)
        } else if let v = try? container.decode(String.self) {
            self = .string(v)
        } else if let v = try? container.decode([AnyDecodableValue].self) {
            self = .array(v)
        } else if let v = try? container.decode([String: AnyDecodableValue].self) {
            self = .object(v)
        } else {
            self = .null
        }
    }
}
