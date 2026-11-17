import XCTest
@testable import AppPackageBuilder

final class UnifiedWinGetSearchServiceTests: XCTestCase {
    private final class Provider: WinGetSourceProvider {
        let source: WinGetSource
        let values: [WinGetSearchResult]
        init(source: WinGetSource, values: [WinGetSearchResult]) { self.source = source; self.values = values }
        func search(query: String) async throws -> [WinGetSearchResult] { values }
        func packageDetails(packageID: String) async throws -> WinGetPackageDetail { throw ProviderError.unavailable("not needed") }
        func availableVersions(packageID: String) async throws -> [WinGetPackageVersion] { [] }
        func installerCandidates(packageID: String, version: String) async throws -> [WinGetInstallerCandidate] { [] }
        func healthCheck() async -> WinGetSourceStatus { WinGetSourceStatus(source: source, state: .ready) }
    }

    func testAuthoritativeResultWinsDuplicateID() async {
        let discovered = WinGetSearchResult(package: WinGetPackage(name: "Old name", publisher: "Vendor", latestVersion: "1.0", description: nil, source: "winget.run", packageID: "Vendor.App"), provider: .wingetRun, isAuthoritative: false)
        let official = WinGetSearchResult(package: WinGetPackage(name: "Official name", publisher: "Vendor", latestVersion: "2.0", description: nil, source: "winget", packageID: "Vendor.App"), provider: .microsoftCommunity, isAuthoritative: true)
        let service = UnifiedWinGetSearchService(providers: [Provider(source: .wingetRun, values: [discovered]), Provider(source: .microsoftCommunity, values: [official])])
        let response = await service.search(query: "app")
        XCTAssertEqual(response.results, [official])
    }
}
