import XCTest
@testable import AppPackageBuilder

/// Small, fully controllable `WinGetDiscoveryProviding` conformer for
/// exercising `WinGetLocalSearchViewModel`'s debounce/cancellation/error
/// handling without any real network calls, mirroring the
/// `MockHomebrewService.delayByQuery` idiom from
/// `NewPackageViewModelSearchTests.swift`.
private final class FakeDiscoveryProvider: WinGetDiscoveryProviding {
    /// Result returned for every call, unless `resultByQuery` has a more
    /// specific entry for the exact query string.
    var result: Result<[WinGetManifestPackage], Error> = .success([])
    var resultByQuery: [String: Result<[WinGetManifestPackage], Error>] = [:]
    var delayNanoseconds: UInt64 = 0
    var delayByQuery: [String: UInt64] = [:]

    private(set) var searchCallCount = 0
    private(set) var searchedQueries: [String] = []

    func search(query: String) async throws -> [WinGetManifestPackage] {
        searchCallCount += 1
        searchedQueries.append(query)
        let delay = delayByQuery[query] ?? delayNanoseconds
        if delay > 0 {
            try await Task.sleep(nanoseconds: delay)
        }
        return try (resultByQuery[query] ?? result).get()
    }
}

@MainActor
final class WinGetLocalSearchViewModelTests: XCTestCase {

    private func makeViewModel(
        official: FakeDiscoveryProvider,
        optional: FakeDiscoveryProvider,
        optionalEnabled: Bool = false
    ) -> WinGetLocalSearchViewModel {
        WinGetLocalSearchViewModel(
            officialProvider: official,
            optionalProvider: optional,
            isOptionalProviderEnabled: { optionalEnabled }
        )
    }

    private func waitUntil(timeout: TimeInterval = 2.0, _ condition: () -> Bool) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition() && Date() < deadline {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    // MARK: Debounce

    func testSearchIsDebouncedFor350msBeforeHittingProviders() async {
        let official = FakeDiscoveryProvider()
        official.result = .success([
            WinGetManifestPackage(id: "7zip.7zip", name: "7-Zip", publisher: "7zip", latestVersion: "23.01", source: "winget")
        ])
        let viewModel = makeViewModel(official: official, optional: FakeDiscoveryProvider())

        viewModel.searchQuery = "7zip.7zip"
        viewModel.search()

        // Well under the 350ms debounce window: the provider must not have
        // been hit yet.
        try? await Task.sleep(nanoseconds: 150_000_000)
        XCTAssertEqual(official.searchCallCount, 0)

        await waitUntil { viewModel.searchPhase == .results }
        XCTAssertEqual(official.searchCallCount, 1)
        XCTAssertEqual(viewModel.results.map(\.id), ["7zip.7zip"])
    }

    // MARK: Cancellation on rapid retype

    func testRapidRetypingCancelsEarlierDebouncedSearch() async {
        let official = FakeDiscoveryProvider()
        official.resultByQuery["7zip.7zi"] = .success([
            WinGetManifestPackage(id: "wrong.wrong", name: "Wrong", publisher: "wrong", latestVersion: "1.0", source: "winget")
        ])
        official.resultByQuery["7zip.7zip"] = .success([
            WinGetManifestPackage(id: "7zip.7zip", name: "7-Zip", publisher: "7zip", latestVersion: "23.01", source: "winget")
        ])
        let viewModel = makeViewModel(official: official, optional: FakeDiscoveryProvider())

        viewModel.searchQuery = "7zip.7zi"
        viewModel.search()
        viewModel.searchQuery = "7zip.7zip"
        viewModel.search()

        await waitUntil { viewModel.searchPhase == .results }
        // Only the final keystroke's search should have actually reached the provider.
        XCTAssertEqual(official.searchedQueries, ["7zip.7zip"])
        XCTAssertEqual(viewModel.results.map(\.id), ["7zip.7zip"])
    }

    // MARK: Stale-slow-search-never-wins (generation guard)

    func testStaleSlowSearchNeverOverwritesNewerFasterResult() async {
        let official = FakeDiscoveryProvider()
        official.resultByQuery["slow.slow"] = .success([
            WinGetManifestPackage(id: "slow.slow", name: "Slow", publisher: "slow", latestVersion: "1.0", source: "winget")
        ])
        official.resultByQuery["fast.fast"] = .success([
            WinGetManifestPackage(id: "fast.fast", name: "Fast", publisher: "fast", latestVersion: "1.0", source: "winget")
        ])
        official.delayByQuery["slow.slow"] = 600_000_000
        official.delayByQuery["fast.fast"] = 10_000_000
        let viewModel = makeViewModel(official: official, optional: FakeDiscoveryProvider())

        viewModel.searchQuery = "slow.slow"
        viewModel.search()
        try? await Task.sleep(nanoseconds: 50_000_000)
        viewModel.searchQuery = "fast.fast"
        viewModel.search()

        await waitUntil(timeout: 2.0) { viewModel.searchPhase == .results }
        // Give the (cancelled) slow search a chance to resolve too, in case
        // cancellation alone didn't stop it — the generation guard must still win.
        try? await Task.sleep(nanoseconds: 700_000_000)

        XCTAssertEqual(viewModel.results.map(\.id), ["fast.fast"])
    }

    // MARK: Blank query

    func testBlankQueryResetsToIdleWithoutCallingProviders() async {
        let official = FakeDiscoveryProvider()
        let optional = FakeDiscoveryProvider()
        let viewModel = makeViewModel(official: official, optional: optional, optionalEnabled: true)

        viewModel.searchQuery = "   "
        viewModel.search()
        try? await Task.sleep(nanoseconds: 500_000_000)

        XCTAssertEqual(viewModel.searchPhase, .idle)
        XCTAssertTrue(viewModel.results.isEmpty)
        XCTAssertNil(viewModel.highlightedIndex)
        XCTAssertEqual(official.searchCallCount, 0)
        XCTAssertEqual(optional.searchCallCount, 0)
    }

    // MARK: Empty results

    func testEmptyResultsSetsEmptyPhase() async {
        let official = FakeDiscoveryProvider()
        official.result = .success([])
        let viewModel = makeViewModel(official: official, optional: FakeDiscoveryProvider())

        viewModel.searchQuery = "nonexistent.package"
        viewModel.search()

        await waitUntil { viewModel.searchPhase == .empty }
        XCTAssertTrue(viewModel.results.isEmpty)
        XCTAssertNil(viewModel.highlightedIndex)
    }

    // MARK: Official-provider-failure -> phase mapping

    func testOfficialProviderOfflineErrorMapsToOfflinePhase() async {
        let official = FakeDiscoveryProvider()
        official.result = .failure(WinGetDiscoveryError.offline)
        let viewModel = makeViewModel(official: official, optional: FakeDiscoveryProvider())

        viewModel.searchQuery = "some.package"
        viewModel.search()

        await waitUntil {
            if case .offline = viewModel.searchPhase { return true }
            return false
        }
        XCTAssertEqual(viewModel.searchPhase, .offline)
    }

    func testOfficialProviderRateLimitedErrorMapsToRateLimitedPhase() async {
        let official = FakeDiscoveryProvider()
        official.result = .failure(WinGetDiscoveryError.rateLimited)
        let viewModel = makeViewModel(official: official, optional: FakeDiscoveryProvider())

        viewModel.searchQuery = "some.package"
        viewModel.search()

        await waitUntil {
            if case .rateLimited = viewModel.searchPhase { return true }
            return false
        }
        XCTAssertEqual(viewModel.searchPhase, .rateLimited)
    }

    func testOfficialProviderOtherErrorMapsToErrorPhaseWithMessage() async {
        let official = FakeDiscoveryProvider()
        official.result = .failure(WinGetDiscoveryError.other("boom"))
        let viewModel = makeViewModel(official: official, optional: FakeDiscoveryProvider())

        viewModel.searchQuery = "some.package"
        viewModel.search()

        await waitUntil {
            if case .error = viewModel.searchPhase { return true }
            return false
        }
        guard case .error(let message) = viewModel.searchPhase else {
            return XCTFail("expected .error phase")
        }
        XCTAssertTrue(message.contains("boom"))
    }

    // MARK: Optional provider gating

    func testOptionalProviderIsNotCalledWhenDisabled() async {
        let official = FakeDiscoveryProvider()
        official.result = .success([
            WinGetManifestPackage(id: "some.package", name: "Some Package", publisher: "some", latestVersion: "1.0", source: "winget")
        ])
        let optional = FakeDiscoveryProvider()
        // Free-text query (not a valid exact ID) so, if the gate were broken,
        // the optional provider would otherwise be eligible to run.
        let viewModel = makeViewModel(official: official, optional: optional, optionalEnabled: false)

        viewModel.searchQuery = "some free text query"
        viewModel.search()

        await waitUntil { viewModel.searchPhase != .loading && viewModel.searchPhase != .idle }
        XCTAssertEqual(optional.searchCallCount, 0)
    }

    func testOptionalProviderIsCalledWhenEnabledAndQueryIsNotAnExactId() async {
        let official = FakeDiscoveryProvider()
        official.result = .success([])
        let optional = FakeDiscoveryProvider()
        optional.result = .success([
            WinGetManifestPackage(id: "some.package", name: "Some Package", publisher: "some", latestVersion: "1.0", source: "winget.run")
        ])
        let viewModel = makeViewModel(official: official, optional: optional, optionalEnabled: true)

        viewModel.searchQuery = "some free text query"
        viewModel.search()

        await waitUntil { viewModel.searchPhase == .results }
        XCTAssertEqual(optional.searchCallCount, 1)
        XCTAssertEqual(viewModel.results.map(\.source), ["winget.run"])
    }
}
