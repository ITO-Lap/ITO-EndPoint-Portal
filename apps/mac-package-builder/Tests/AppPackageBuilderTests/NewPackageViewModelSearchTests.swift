import XCTest
@testable import AppPackageBuilder

// MARK: - Mocks

private final class MockHomebrewService: HomebrewServicing {
    var searchResultsByQuery: [String: [BrewSearchResult]] = [:]
    var delayByQuery: [String: UInt64] = [:]
    var defaultDelayNanoseconds: UInt64 = 0
    var searchError: Error?
    var infoResult: BrewPackageInfo?
    var infoError: Error?

    private(set) var searchCallCount = 0
    private(set) var searchedQueries: [String] = []

    func locateBrewExecutable() -> String? { "/opt/homebrew/bin/brew" }

    func search(query: String) async throws -> [BrewSearchResult] {
        searchCallCount += 1
        searchedQueries.append(query)
        let delay = delayByQuery[query] ?? defaultDelayNanoseconds
        if delay > 0 { try await Task.sleep(nanoseconds: delay) }
        if let searchError { throw searchError }
        return searchResultsByQuery[query] ?? []
    }

    func info(token: String, kind: PackageKind) async throws -> BrewPackageInfo {
        if let infoError { throw infoError }
        guard let infoResult else { throw HomebrewServiceError.notFound(token) }
        return infoResult
    }

    func brewVersion() async throws -> String { "Homebrew 6.0.0" }
}

private final class MockValidationService: ValidationServicing {
    func runChecks(for configuration: PackageConfiguration, packageInfo: BrewPackageInfo?) async -> ValidationSummary {
        ValidationSummary(checks: [])
    }
}

private final class MockBuildHistoryService: BuildHistoryServicing {
    func loadAll() -> [BuildHistoryRecord] { [] }
    func save(_ record: BuildHistoryRecord) {}
    func remove(id: UUID) {}
}

private final class MockSigningService: SigningServicing {
    func availableInstallerIdentities() async -> [SigningIdentity] { [] }
    func sign(packageAt path: URL, identity: SigningIdentity, outputPath: URL) async throws {}
    func verifySignature(of path: URL) async throws -> String { "" }
}

// MARK: - Tests

@MainActor
final class NewPackageViewModelSearchTests: XCTestCase {

    private func makeViewModel(homebrewService: HomebrewServicing) -> NewPackageViewModel {
        NewPackageViewModel(
            homebrewService: homebrewService,
            validationService: MockValidationService(),
            packageBuilder: PackageBuilderService(),
            historyService: MockBuildHistoryService(),
            signingService: MockSigningService(),
            settings: SettingsStore()
        )
    }

    private func waitUntil(timeout: TimeInterval = 2.0, _ condition: () -> Bool) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition() && Date() < deadline {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    // MARK: Query binding

    func testSearchQueryBindingUpdates() {
        let viewModel = makeViewModel(homebrewService: MockHomebrewService())
        viewModel.searchQuery = "redis"
        XCTAssertEqual(viewModel.searchQuery, "redis")
    }

    func testBelowMinimumLengthDoesNotSearch() async {
        let mock = MockHomebrewService()
        let viewModel = makeViewModel(homebrewService: mock)
        viewModel.searchQuery = "r"
        viewModel.search()
        try? await Task.sleep(nanoseconds: 500_000_000)
        XCTAssertEqual(mock.searchCallCount, 0)
        XCTAssertEqual(viewModel.searchPhase, .idle)
    }

    // MARK: Debounce and cancellation

    func testSearchIsDebouncedBeforeHittingTheService() async {
        let mock = MockHomebrewService()
        mock.searchResultsByQuery["redis"] = [BrewSearchResult(token: "redis", name: "redis", kind: .formula)]
        let viewModel = makeViewModel(homebrewService: mock)

        viewModel.searchQuery = "redis"
        viewModel.search()

        // Well under the 300ms debounce window: the service must not have been hit yet.
        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(mock.searchCallCount, 0)

        await waitUntil { viewModel.searchPhase == .results }
        XCTAssertEqual(mock.searchCallCount, 1)
        XCTAssertEqual(viewModel.searchResults.map(\.token), ["redis"])
    }

    func testRapidRetypingCancelsEarlierDebouncedSearch() async {
        let mock = MockHomebrewService()
        mock.searchResultsByQuery["re"] = [BrewSearchResult(token: "redis", name: "redis", kind: .formula)]
        mock.searchResultsByQuery["red"] = [BrewSearchResult(token: "redis", name: "redis", kind: .formula)]
        let viewModel = makeViewModel(homebrewService: mock)

        viewModel.searchQuery = "re"
        viewModel.search()
        viewModel.searchQuery = "red"
        viewModel.search()

        await waitUntil { viewModel.searchPhase == .results }
        // Only the final keystroke's search should have actually reached the service.
        XCTAssertEqual(mock.searchedQueries, ["red"])
    }

    func testStaleSlowSearchNeverOverwritesNewerFasterResult() async {
        let mock = MockHomebrewService()
        mock.searchResultsByQuery["re"] = [BrewSearchResult(token: "redis", name: "redis", kind: .formula)]
        mock.searchResultsByQuery["redis"] = [BrewSearchResult(token: "redis-leveldb", name: "redis-leveldb", kind: .formula)]
        mock.delayByQuery["re"] = 600_000_000
        mock.delayByQuery["redis"] = 10_000_000
        let viewModel = makeViewModel(homebrewService: mock)

        viewModel.searchQuery = "re"
        viewModel.search()
        try? await Task.sleep(nanoseconds: 50_000_000)
        viewModel.searchQuery = "redis"
        viewModel.search()

        await waitUntil(timeout: 2.0) { viewModel.searchPhase == .results }
        // Give the (cancelled) slow "re" search a chance to resolve too, in case
        // cancellation alone didn't stop it — the generation guard must still win.
        try? await Task.sleep(nanoseconds: 700_000_000)

        XCTAssertEqual(viewModel.searchResults.map(\.token), ["redis-leveldb"])
    }

    // MARK: Cask and formula results

    func testResultsCanIncludeBothCasksAndFormulas() async {
        let mock = MockHomebrewService()
        mock.searchResultsByQuery["visual"] = [
            BrewSearchResult(token: "visual-studio-code", name: "visual-studio-code", kind: .cask),
            BrewSearchResult(token: "visualvm", name: "visualvm", kind: .formula)
        ]
        let viewModel = makeViewModel(homebrewService: mock)

        viewModel.searchQuery = "visual"
        viewModel.search()

        await waitUntil { viewModel.searchPhase == .results }
        XCTAssertTrue(viewModel.searchResults.contains { $0.token == "visual-studio-code" && $0.kind == .cask })
        XCTAssertTrue(viewModel.searchResults.contains { $0.token == "visualvm" && $0.kind == .formula })
    }

    // MARK: Error handling

    func testEmptyResultsSetsEmptyPhase() async {
        let mock = MockHomebrewService()
        let viewModel = makeViewModel(homebrewService: mock)

        viewModel.searchQuery = "zzzznoexist"
        viewModel.search()

        await waitUntil { viewModel.searchPhase == .empty }
        XCTAssertTrue(viewModel.searchResults.isEmpty)
    }

    func testServiceFailureSurfacesAsErrorPhase() async {
        let mock = MockHomebrewService()
        mock.searchError = HomebrewServiceError.decodingFailed("boom")
        let viewModel = makeViewModel(homebrewService: mock)

        viewModel.searchQuery = "redis"
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

    func testMissingHomebrewSurfacesClearError() async {
        let mock = MockHomebrewService()
        mock.searchError = HomebrewServiceError.brewNotFound
        let viewModel = makeViewModel(homebrewService: mock)

        viewModel.searchQuery = "redis"
        viewModel.search()

        await waitUntil {
            if case .error = viewModel.searchPhase { return true }
            return false
        }
        guard case .error(let message) = viewModel.searchPhase else {
            return XCTFail("expected .error phase")
        }
        XCTAssertTrue(message.localizedCaseInsensitiveContains("homebrew"))
    }

    // MARK: Selection

    func testSelectingResultPopulatesConfigurationAndClearsResults() async {
        let mock = MockHomebrewService()
        mock.infoResult = BrewPackageInfo(
            token: "redis", name: "Redis", kind: .formula, description: "In-memory store",
            homepage: nil, version: "7.2.4", sourceURL: nil, sha256: nil,
            declaresService: true, hasArmVariant: true, hasIntelVariant: true, artifactAppNames: []
        )
        let viewModel = makeViewModel(homebrewService: mock)

        viewModel.select(BrewSearchResult(token: "redis", name: "redis", kind: .formula))

        await waitUntil { viewModel.selectedPackageInfo != nil }
        XCTAssertEqual(viewModel.selectedPackageInfo?.token, "redis")
        XCTAssertEqual(viewModel.configuration.homebrewToken, "redis")
        XCTAssertEqual(viewModel.configuration.packageKind, .formula)
        XCTAssertTrue(viewModel.configuration.startHomebrewService)
        XCTAssertEqual(viewModel.searchQuery, "redis")
        XCTAssertTrue(viewModel.searchResults.isEmpty)
        XCTAssertEqual(viewModel.configuration.packageVersion, "7.2.4")
    }

    func testSelectingResultSanitizesVersionForCommaSeparatedCaskVersions() async {
        let mock = MockHomebrewService()
        mock.infoResult = BrewPackageInfo(
            token: "some-cask", name: "Some App", kind: .cask, description: nil,
            homepage: nil, version: "121.0.6167,85", sourceURL: nil, sha256: nil,
            declaresService: false, hasArmVariant: true, hasIntelVariant: true, artifactAppNames: []
        )
        let viewModel = makeViewModel(homebrewService: mock)

        viewModel.select(BrewSearchResult(token: "some-cask", name: "some-cask", kind: .cask))

        await waitUntil { viewModel.selectedPackageInfo != nil }
        // The comma isn't valid in Validators.validateVersion's pattern —
        // must be sanitized so the build doesn't fail on a real cask version.
        XCTAssertEqual(viewModel.configuration.packageVersion, "121.0.6167-85")
        XCTAssertTrue(Validators.isValidVersion(viewModel.configuration.packageVersion))
    }

    func testSelectingResultKeepsExistingVersionWhenHomebrewReportsUnknown() async {
        let mock = MockHomebrewService()
        mock.infoResult = BrewPackageInfo(
            token: "mystery", name: "Mystery", kind: .formula, description: nil,
            homepage: nil, version: "unknown", sourceURL: nil, sha256: nil,
            declaresService: false, hasArmVariant: true, hasIntelVariant: true, artifactAppNames: []
        )
        let viewModel = makeViewModel(homebrewService: mock)
        let originalVersion = viewModel.configuration.packageVersion

        viewModel.select(BrewSearchResult(token: "mystery", name: "mystery", kind: .formula))

        await waitUntil { viewModel.selectedPackageInfo != nil }
        XCTAssertEqual(viewModel.configuration.packageVersion, originalVersion)
    }

    func testReTriggeringSearchAfterSelectionDoesNotRefetch() async {
        let mock = MockHomebrewService()
        mock.searchResultsByQuery["redis"] = [BrewSearchResult(token: "redis", name: "redis", kind: .formula)]
        mock.infoResult = BrewPackageInfo(
            token: "redis", name: "Redis", kind: .formula, description: nil,
            homepage: nil, version: "7.2.4", sourceURL: nil, sha256: nil,
            declaresService: false, hasArmVariant: true, hasIntelVariant: true, artifactAppNames: []
        )
        let viewModel = makeViewModel(homebrewService: mock)

        viewModel.select(BrewSearchResult(token: "redis", name: "redis", kind: .formula))
        await waitUntil { viewModel.selectedPackageInfo != nil }

        // The TextField's onChange fires `search()` again because `select(_:)`
        // programmatically writes the token into `searchQuery`. That must not
        // re-hit the service or repopulate the results dropdown.
        viewModel.search()
        try? await Task.sleep(nanoseconds: 500_000_000)

        XCTAssertEqual(mock.searchCallCount, 0)
        XCTAssertTrue(viewModel.searchResults.isEmpty)
    }

    // MARK: Keyboard navigation

    func testMoveHighlightWrapsAroundResults() async {
        let mock = MockHomebrewService()
        mock.searchResultsByQuery["redis"] = [
            BrewSearchResult(token: "redis", name: "redis", kind: .formula),
            BrewSearchResult(token: "redis-leveldb", name: "redis-leveldb", kind: .formula)
        ]
        let viewModel = makeViewModel(homebrewService: mock)
        viewModel.searchQuery = "redis"
        viewModel.search()
        await waitUntil { viewModel.searchPhase == .results }

        XCTAssertEqual(viewModel.highlightedResultIndex, 0)
        viewModel.moveHighlight(by: -1)
        XCTAssertEqual(viewModel.highlightedResultIndex, 1)
        viewModel.moveHighlight(by: 1)
        XCTAssertEqual(viewModel.highlightedResultIndex, 0)
    }

    func testEscapeDismissesResultsWithoutClearingQuery() async {
        let mock = MockHomebrewService()
        mock.searchResultsByQuery["redis"] = [BrewSearchResult(token: "redis", name: "redis", kind: .formula)]
        let viewModel = makeViewModel(homebrewService: mock)
        viewModel.searchQuery = "redis"
        viewModel.search()
        await waitUntil { viewModel.searchPhase == .results }

        viewModel.dismissResults()

        XCTAssertTrue(viewModel.searchResults.isEmpty)
        XCTAssertEqual(viewModel.searchQuery, "redis")
        XCTAssertEqual(viewModel.searchPhase, .idle)
    }
}
