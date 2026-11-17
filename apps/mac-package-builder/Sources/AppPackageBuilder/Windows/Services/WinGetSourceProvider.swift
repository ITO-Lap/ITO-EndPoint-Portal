import Foundation

/// Provider boundary for approved WinGet catalogs. Implementations return
/// normalized values and never expose an arbitrary URL or shell command path.
protocol WinGetSourceProvider {
    var source: WinGetSource { get }
    func search(query: String) async throws -> [WinGetSearchResult]
    func packageDetails(packageID: String) async throws -> WinGetPackageDetail
    func availableVersions(packageID: String) async throws -> [WinGetPackageVersion]
    func installerCandidates(packageID: String, version: String) async throws -> [WinGetInstallerCandidate]
    func healthCheck() async -> WinGetSourceStatus
}

/// The connected Windows agent is the primary Microsoft source adapter. It
/// runs supported WinGet operations remotely; macOS never invokes Windows
/// tooling itself.
final class MicrosoftWinGetSourceProvider: WinGetSourceProvider {
    let source: WinGetSource
    private let client: RemoteBuildAgentServicing

    init(client: RemoteBuildAgentServicing, source: WinGetSource = .microsoftCommunity) {
        self.client = client; self.source = source
    }

    func search(query: String) async throws -> [WinGetSearchResult] {
        let packages = try await client.searchPackages(query: query, source: source.rawValue)
        return packages.map { WinGetSearchResult(package: $0, provider: source, isAuthoritative: true) }
    }
    func packageDetails(packageID: String) async throws -> WinGetPackageDetail { try await client.packageDetail(id: packageID) }
    func availableVersions(packageID: String) async throws -> [WinGetPackageVersion] {
        let detail = try await packageDetails(packageID: packageID)
        return detail.availableVersions.map { WinGetPackageVersion(version: $0, releaseDate: nil, isStable: !Self.isPrerelease($0)) }
    }
    func installerCandidates(packageID: String, version: String) async throws -> [WinGetInstallerCandidate] {
        let detail = try await packageDetails(packageID: packageID)
        guard detail.availableVersions.contains(version) || detail.latestVersion == version else { return [] }
        return [WinGetInstallerCandidate(packageID: packageID, version: version, type: detail.installerType, architecture: detail.architecture, scope: detail.scope, locale: detail.locale, url: detail.installerURL, sha256: detail.sha256, productCode: nil, upgradeCode: nil, installSwitch: nil, uninstallSwitch: nil, originalFilename: detail.installerURL?.lastPathComponent)]
    }
    func healthCheck() async -> WinGetSourceStatus {
        do { _ = try await client.health(); return WinGetSourceStatus(source: source, state: .ready) }
        catch { return WinGetSourceStatus(source: source, state: .unavailable(error.localizedDescription)) }
    }
    private static func isPrerelease(_ version: String) -> Bool { version.range(of: #"(?i)(alpha|beta|preview|rc)"#, options: .regularExpression) != nil }
}

/// winget.run is intentionally discovery-only. It remains disabled until a
/// documented, permitted API endpoint is configured by the administrator;
/// this avoids HTML scraping and keeps it out of the trust path.
final class WingetRunDiscoveryProvider: WinGetSourceProvider {
    let source: WinGetSource = .wingetRun
    func search(query: String) async throws -> [WinGetSearchResult] { throw ProviderError.unavailable("winget.run discovery is not configured.") }
    func packageDetails(packageID: String) async throws -> WinGetPackageDetail { throw ProviderError.unavailable("Discovery results must be verified by Microsoft WinGet.") }
    func availableVersions(packageID: String) async throws -> [WinGetPackageVersion] { [] }
    func installerCandidates(packageID: String, version: String) async throws -> [WinGetInstallerCandidate] { [] }
    func healthCheck() async -> WinGetSourceStatus { WinGetSourceStatus(source: source, state: .unavailable("No documented, configured winget.run API endpoint.")) }
}

/// winstall has no enabled integration unless an administrator provides a
/// stable, documented and permitted API adapter in a future release.
final class WinstallDiscoveryProvider: WinGetSourceProvider {
    let source: WinGetSource = .winstall
    func search(query: String) async throws -> [WinGetSearchResult] { throw ProviderError.unavailable("winstall does not have an enabled documented API.") }
    func packageDetails(packageID: String) async throws -> WinGetPackageDetail { throw ProviderError.unavailable("winstall is discovery-only.") }
    func availableVersions(packageID: String) async throws -> [WinGetPackageVersion] { [] }
    func installerCandidates(packageID: String, version: String) async throws -> [WinGetInstallerCandidate] { [] }
    func healthCheck() async -> WinGetSourceStatus { WinGetSourceStatus(source: source, state: .unavailable("No stable documented winstall API is enabled.")) }
}

enum ProviderError: LocalizedError { case unavailable(String); var errorDescription: String? { if case .unavailable(let message) = self { return message }; return nil } }
