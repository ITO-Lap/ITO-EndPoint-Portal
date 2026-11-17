import XCTest
@testable import AppPackageBuilder

/// Debounce/cancellation/stale-result-guard tests for `WinGetCatalogViewModel`,
/// structured exactly like `NewPackageViewModelSearchTests` for the macOS
/// Homebrew search flow — same 300ms debounce concept, same generation-counter
/// guard against a slow stale search clobbering a fresher one's results, just
/// driven against `MockBuildAgentClient` instead of `MockHomebrewService`.
@MainActor
final class WinGetCatalogViewModelSearchTests: XCTestCase {

    private func waitUntil(timeout: TimeInterval = 2.0, _ condition: () -> Bool) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition() && Date() < deadline {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    private func package(_ name: String, publisher: String = "Some Publisher", version: String = "1.0.0") -> WinGetPackage {
        WinGetPackage(name: name, publisher: publisher, latestVersion: version, description: nil, source: "winget")
    }

    // MARK: Debounce and cancellation

    func testSearchIsDebouncedBeforeHittingTheClient() async {
        let mock = MockBuildAgentClient()
        mock.searchPackagesResult = .success([package("Visual Studio Code")])
        let viewModel = WinGetCatalogViewModel(client: mock)

        viewModel.searchQuery = "code"
        viewModel.search()

        // Well under WinGetCatalogViewModel's 300ms debounce window: the
        // client must not have been hit yet.
        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(mock.searchQueries.count, 0)

        await waitUntil { !viewModel.results.isEmpty }
        XCTAssertEqual(mock.searchQueries.count, 1)
        XCTAssertEqual(viewModel.results.map(\.name), ["Visual Studio Code"])
    }

    func testRapidRetypingCancelsEarlierDebouncedSearch() async {
        let mock = MockBuildAgentClient()
        mock.searchPackagesResult = .success([package("Notepad++")])
        let viewModel = WinGetCatalogViewModel(client: mock)

        viewModel.searchQuery = "note"
        viewModel.search()
        viewModel.searchQuery = "notepad"
        viewModel.search()

        await waitUntil { !viewModel.results.isEmpty }
        // Only the final keystroke's search should have actually reached the client.
        XCTAssertEqual(mock.searchQueries.map(\.query), ["notepad"])
    }

    func testStaleSlowSearchNeverOverwritesNewerFasterResult() async {
        let mock = MockBuildAgentClient()
        mock.searchPackagesResult = .success([package("stale-result")])
        mock.searchDelayByQuery["sl"] = 600_000_000
        let viewModel = WinGetCatalogViewModel(client: mock)

        viewModel.searchQuery = "sl"
        viewModel.search()
        // Let the debounce elapse and the slow "sl" call start.
        try? await Task.sleep(nanoseconds: 350_000_000)

        // Now retype to something that resolves fast, before "sl" returns.
        mock.searchPackagesResult = .success([package("fast-result")])
        viewModel.searchQuery = "fast"
        viewModel.search()

        await waitUntil(timeout: 2.0) { !viewModel.results.isEmpty }
        // Give the (cancelled) slow "sl" search a chance to resolve too, in
        // case cancellation alone didn't stop it — the generation guard must
        // still win.
        try? await Task.sleep(nanoseconds: 700_000_000)

        XCTAssertEqual(viewModel.results.map(\.name), ["fast-result"])
    }

    // MARK: Empty query / empty results

    func testBlankQueryWithNoFiltersDoesNotSearch() async {
        let mock = MockBuildAgentClient()
        let viewModel = WinGetCatalogViewModel(client: mock)

        viewModel.searchQuery = "   "
        viewModel.search()

        try? await Task.sleep(nanoseconds: 500_000_000)
        XCTAssertEqual(mock.searchQueries.count, 0)
        XCTAssertEqual(viewModel.phase, .idle)
        XCTAssertTrue(viewModel.results.isEmpty)
    }

    func testEmptyResultsSetsEmptyPhase() async {
        let mock = MockBuildAgentClient()
        mock.searchPackagesResult = .success([])
        let viewModel = WinGetCatalogViewModel(client: mock)

        viewModel.searchQuery = "zzznoexist"
        viewModel.search()

        await waitUntil { viewModel.phase == .empty }
        XCTAssertTrue(viewModel.results.isEmpty)
    }

    // MARK: Error handling

    func testClientFailureSurfacesAsDisconnectedPhase() async {
        let mock = MockBuildAgentClient()
        mock.searchPackagesResult = .failure(MockBuildAgentClient.MockError.generic("agent unreachable"))
        let viewModel = WinGetCatalogViewModel(client: mock)

        viewModel.searchQuery = "code"
        viewModel.search()

        await waitUntil { viewModel.phase == .disconnected }
        XCTAssertTrue(viewModel.results.isEmpty)
    }

    // MARK: clearSearch cancels in-flight work

    func testClearSearchCancelsPendingDebouncedSearch() async {
        let mock = MockBuildAgentClient()
        mock.searchPackagesResult = .success([package("should-not-appear")])
        let viewModel = WinGetCatalogViewModel(client: mock)

        viewModel.searchQuery = "code"
        viewModel.search()
        viewModel.clearSearch()

        // Give the (cancelled) debounce+search a chance to fire anyway.
        try? await Task.sleep(nanoseconds: 500_000_000)

        XCTAssertEqual(mock.searchQueries.count, 0)
        XCTAssertTrue(viewModel.results.isEmpty)
        XCTAssertEqual(viewModel.phase, .idle)
        XCTAssertEqual(viewModel.searchQuery, "")
    }
}
