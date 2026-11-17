import Foundation
import Yams

enum WinGetManifestServiceError: LocalizedError {
    case invalidPackageId(String)
    case versionNotFound(String)
    case manifestNotFound
    case malformedManifest(String)

    var errorDescription: String? {
        switch self {
        case .invalidPackageId(let id):
            return "\"\(id)\" is not a valid WinGet package identifier."
        case .versionNotFound(let version):
            return "Version \"\(version)\" was not found for this package."
        case .manifestNotFound:
            return "No installer manifest was found for this package/version."
        case .malformedManifest(let reason):
            return "Could not parse the WinGet installer manifest: \(reason)"
        }
    }
}

/// Fetches and parses official WinGet manifests directly from
/// `microsoft/winget-pkgs` on GitHub — the authoritative source for
/// installer URLs, hashes, and silent-install metadata (never the optional
/// third-party discovery provider).
///
/// Schema note: field names below (`InstallerSha256`, `InstallerSwitches.
/// Silent`/`.SilentWithProgress`, `AppsAndFeaturesEntries[].ProductCode`/
/// `.UpgradeCode`, etc.) reflect the public WinGet manifest schema
/// (`microsoft/winget-cli` `manifest.installer.*.yaml` schemas) as of this
/// writing. If a future schema revision renames a key, the corresponding
/// field will simply come back `nil` here (extraction is defensive, not
/// exhaustive) rather than throwing.
final class WinGetManifestService {
    private let urlSession: URLSession

    init(urlSession: URLSession = .shared) {
        self.urlSession = urlSession
    }

    /// Lists version folder names available for `packageId`, sourced from
    /// the GitHub contents API (same pattern as
    /// `OfficialManifestLookupProvider`), sorted ascending (last = latest by
    /// best-effort lexicographic ordering).
    func availableVersions(for packageId: String) async throws -> [String] {
        guard WinGetManifestPath.isValidId(packageId) else {
            throw WinGetManifestServiceError.invalidPackageId(packageId)
        }
        guard let url = WinGetManifestPath.contentsAPIURL(for: packageId) else {
            throw WinGetManifestServiceError.invalidPackageId(packageId)
        }

        let (data, response) = try await fetch(URLRequest(url: url))
        guard let httpResponse = response as? HTTPURLResponse else {
            throw WinGetDiscoveryError.other("Unexpected response from GitHub.")
        }
        if httpResponse.statusCode == 404 { return [] }
        if httpResponse.statusCode == 403 { throw WinGetDiscoveryError.rateLimited }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw WinGetDiscoveryError.other("GitHub returned status \(httpResponse.statusCode).")
        }

        let entries = try JSONDecoder().decode([GitHubContentsEntry].self, from: data)
        return entries.filter { $0.type == "dir" }.map(\.name).sorted()
    }

    /// Fetches and parses the installer manifest for `packageId` at
    /// `version` (or the latest available version if `version` is `nil`),
    /// selecting the installer entry matching `architecture` (and
    /// `installerType`, if provided). Best-effort also fetches the
    /// `.locale.en-US.yaml` manifest for a nicer display name, without
    /// blocking on its success.
    func fetchInstallerManifest(
        packageId: String,
        version requestedVersion: String?,
        architecture: WinGetArchitecture,
        installerType: WinGetInstallerType?
    ) async throws -> WinGetInstallerManifest {
        guard WinGetManifestPath.isValidId(packageId) else {
            throw WinGetManifestServiceError.invalidPackageId(packageId)
        }

        let version: String
        if let requestedVersion, !requestedVersion.isEmpty {
            version = requestedVersion
        } else {
            let versions = try await availableVersions(for: packageId)
            guard let latest = versions.last else {
                throw WinGetManifestServiceError.versionNotFound("latest")
            }
            version = latest
        }

        guard let installerFileURL = WinGetManifestPath.rawFileURL(
            for: packageId,
            version: version,
            fileName: "\(packageId).installer.yaml"
        ) else {
            throw WinGetManifestServiceError.manifestNotFound
        }

        let (installerData, installerResponse) = try await fetch(URLRequest(url: installerFileURL))
        guard let httpResponse = installerResponse as? HTTPURLResponse else {
            throw WinGetDiscoveryError.other("Unexpected response fetching the installer manifest.")
        }
        if httpResponse.statusCode == 404 {
            throw WinGetManifestServiceError.manifestNotFound
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw WinGetDiscoveryError.other("GitHub returned status \(httpResponse.statusCode) for the installer manifest.")
        }

        guard let yamlText = String(data: installerData, encoding: .utf8) else {
            throw WinGetManifestServiceError.malformedManifest("non-UTF8 content")
        }

        // Best-effort locale fetch for display purposes; never blocks the
        // main result on failure.
        let localeTag = "en-US"
        var localeText: String? = nil
        if let localeFileURL = WinGetManifestPath.rawFileURL(
            for: packageId,
            version: version,
            fileName: "\(packageId).locale.\(localeTag).yaml"
        ), let (localeData, localeResponse) = try? await fetch(URLRequest(url: localeFileURL)),
           let localeHTTPResponse = localeResponse as? HTTPURLResponse,
           (200..<300).contains(localeHTTPResponse.statusCode),
           let decodedLocaleText = String(data: localeData, encoding: .utf8) {
            localeText = decodedLocaleText
        }

        return try Self.parse(
            installerYAML: yamlText,
            localeYAML: localeText,
            packageId: packageId,
            version: version,
            preferredArchitecture: architecture,
            preferredInstallerType: installerType
        )
    }

    /// Pure YAML-parsing logic, deliberately factored out of
    /// `fetchInstallerManifest` so it's unit-testable against inline fixture
    /// strings with no network access at all. `fetchInstallerManifest` is the
    /// only caller that supplies network-fetched text; tests call this
    /// directly with fixtures instead.
    static func parse(
        installerYAML: String,
        localeYAML: String?,
        packageId: String,
        version: String,
        preferredArchitecture: WinGetArchitecture,
        preferredInstallerType: WinGetInstallerType?
    ) throws -> WinGetInstallerManifest {
        let root: Any
        do {
            root = try Yams.load(yaml: installerYAML) ?? [:]
        } catch {
            throw WinGetManifestServiceError.malformedManifest(error.localizedDescription)
        }
        guard let rootMap = root as? [String: Any] else {
            throw WinGetManifestServiceError.malformedManifest("root is not a mapping")
        }

        var localeMap: [String: Any]? = nil
        if let localeYAML, let parsedLocale = try? Yams.load(yaml: localeYAML) as? [String: Any] {
            localeMap = parsedLocale
        }

        return try buildManifest(
            packageId: packageId,
            version: version,
            root: rootMap,
            localeMap: localeMap,
            preferredArchitecture: preferredArchitecture,
            preferredInstallerType: preferredInstallerType
        )
    }

    private static func buildManifest(
        packageId: String,
        version: String,
        root: [String: Any],
        localeMap: [String: Any]?,
        preferredArchitecture: WinGetArchitecture,
        preferredInstallerType: WinGetInstallerType?
    ) throws -> WinGetInstallerManifest {
        guard let installers = root["Installers"] as? [[String: Any]], !installers.isEmpty else {
            throw WinGetManifestServiceError.malformedManifest("no Installers entries found")
        }

        // Top-level InstallerSwitches/InstallerType/Scope act as manifest-wide
        // defaults that individual installer entries may override.
        let topLevelSwitches = root["InstallerSwitches"] as? [String: Any]
        let topLevelInstallerType = root["InstallerType"] as? String
        let topLevelScope = root["Scope"] as? String

        func matches(_ installer: [String: Any]) -> Bool {
            guard let archString = installer["Architecture"] as? String,
                  archString.lowercased() == preferredArchitecture.scriptValue.lowercased() else {
                return false
            }
            if let preferredInstallerType {
                let typeString = (installer["InstallerType"] as? String) ?? topLevelInstallerType ?? ""
                guard WinGetInstallerType(manifestValue: typeString) == preferredInstallerType else {
                    return false
                }
            }
            return true
        }

        let selected = installers.first(where: matches) ?? installers.first { installer in
            (installer["Architecture"] as? String)?.lowercased() == preferredArchitecture.scriptValue.lowercased()
        } ?? installers[0]

        guard let installerURLString = selected["InstallerUrl"] as? String,
              let installerURL = URL(string: installerURLString),
              installerURL.scheme?.lowercased() == "https" else {
            throw WinGetManifestServiceError.malformedManifest("missing or non-HTTPS InstallerUrl")
        }

        let architectureString = (selected["Architecture"] as? String) ?? preferredArchitecture.scriptValue
        let architecture = WinGetArchitecture(rawValue: architectureString.lowercased()) ?? preferredArchitecture

        let installerTypeString = (selected["InstallerType"] as? String) ?? topLevelInstallerType ?? ""
        let resolvedInstallerType = WinGetInstallerType(manifestValue: installerTypeString) ?? .exe

        let scopeString = (selected["Scope"] as? String) ?? topLevelScope
        let scope: WinGetInstallScope? = {
            switch scopeString?.lowercased() {
            case "machine": return .machine
            case "user": return .user
            default: return nil
            }
        }()

        let sha256 = (selected["InstallerSha256"] as? String)?.lowercased()

        // Per-installer keys override the manifest-wide defaults key by key
        // (e.g. a top-level `Silent` still applies if the entry only sets
        // `Custom`).
        let switches = (topLevelSwitches ?? [:]).merging(
            (selected["InstallerSwitches"] as? [String: Any]) ?? [:]
        ) { _, perInstaller in perInstaller }
        let silentInstall = (switches["Silent"] as? String) ?? (switches["SilentWithProgress"] as? String)
        let silentUninstall = switches["Custom"] as? String

        var productCode: String? = selected["ProductCode"] as? String
        var upgradeCode: String? = nil
        if let entries = selected["AppsAndFeaturesEntries"] as? [[String: Any]], let first = entries.first {
            productCode = productCode ?? (first["ProductCode"] as? String)
            upgradeCode = first["UpgradeCode"] as? String
        }

        let packageName = localeMap?["PackageName"] as? String
        let expectedOutputName = packageName

        return WinGetInstallerManifest(
            packageId: packageId,
            version: version,
            installerURL: installerURL,
            installerType: resolvedInstallerType,
            architecture: architecture,
            scope: scope,
            sha256: sha256,
            silentInstallSwitches: silentInstall,
            silentUninstallSwitches: silentUninstall,
            upgradeCode: upgradeCode,
            productCode: productCode,
            expectedOutputName: expectedOutputName,
            locale: (root["InstallerLocale"] as? String) ?? (selected["InstallerLocale"] as? String)
        )
    }

    private func fetch(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await urlSession.data(for: request)
        } catch is URLError {
            throw WinGetDiscoveryError.offline
        } catch {
            throw WinGetDiscoveryError.other(error.localizedDescription)
        }
    }
}
