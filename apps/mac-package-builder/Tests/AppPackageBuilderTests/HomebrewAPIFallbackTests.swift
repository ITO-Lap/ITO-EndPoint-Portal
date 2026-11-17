import XCTest
@testable import AppPackageBuilder

/// Simulates a Mac with no Homebrew: HomebrewService must serve search/info
/// from the public JSON API (stubbed here) and never launch a process.
final class HomebrewAPIFallbackTests: XCTestCase {

    private final class FailingRunner: ProcessRunning {
        private(set) var calls = 0
        func run(_ executablePath: String, arguments: [String], currentDirectory: URL?,
                 environment: [String: String]?, onOutputLine: (@Sendable (String) -> Void)?) async throws -> ProcessOutput {
            calls += 1
            throw HomebrewServiceError.brewNotFound
        }
    }

    private final class Stub: @unchecked Sendable {
        var requests: [URL] = []
        var online = true
        let index = #"[{"token":"firefox","name":["Mozilla Firefox"]},{"token":"firefox@beta","name":["Firefox Beta"]},{"token":"visual-studio-code","name":["Microsoft Visual Studio Code"]}]"#
        let firefox = #"{"token":"firefox","name":["Mozilla Firefox"],"desc":"Web browser","homepage":"https://www.mozilla.org/firefox/","url":"https://example.com/Firefox.dmg","version":"160.0","sha256":"abc123","artifacts":[{"app":["Firefox.app"]}]}"#

        func fetch(_ request: URLRequest) async throws -> (Data, URLResponse) {
            let url = request.url!
            requests.append(url)
            guard online else { throw URLError(.notConnectedToInternet) }
            func reply(_ body: String, _ code: Int = 200) -> (Data, URLResponse) {
                (Data(body.utf8), HTTPURLResponse(url: url, statusCode: code, httpVersion: nil, headerFields: nil)!)
            }
            switch url.lastPathComponent {
            case "cask.json": return reply(index)
            case "firefox.json": return reply(firefox)
            default: return reply("{}", 404)
            }
        }
    }

    private func makeService(stub: Stub, runner: FailingRunner = FailingRunner()) -> HomebrewService {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("brew-api-\(UUID().uuidString)")
        let api = HomebrewAPIClient(cacheDirectory: dir, fetch: stub.fetch)
        return HomebrewService(processRunner: runner, apiClient: api, brewLocator: { nil })
    }

    func testSearchRanksExactThenPrefixAndNeverLaunchesBrew() async throws {
        let runner = FailingRunner()
        let service = makeService(stub: Stub(), runner: runner)
        let results = try await service.search(query: "firefox")
        XCTAssertEqual(results.map(\.token), ["firefox", "firefox@beta"])
        XCTAssertTrue(results.allSatisfy { $0.kind == .cask })
        XCTAssertEqual(runner.calls, 0)
    }

    func testSearchMatchesDisplayName() async throws {
        let results = try await makeService(stub: Stub()).search(query: "visual studio")
        XCTAssertEqual(results.map(\.token), ["visual-studio-code"])
    }

    func testIndexIsCachedBetweenSearches() async throws {
        let stub = Stub()
        let service = makeService(stub: stub)
        _ = try await service.search(query: "fire")
        _ = try await service.search(query: "visual")
        XCTAssertEqual(stub.requests.filter { $0.lastPathComponent == "cask.json" }.count, 1)
    }

    func testCaskInfoDecodesFromAPI() async throws {
        let info = try await makeService(stub: Stub()).info(token: "firefox", kind: .cask)
        XCTAssertEqual(info.version, "160.0")
        XCTAssertEqual(info.sha256, "abc123")
        XCTAssertEqual(info.sourceURL, "https://example.com/Firefox.dmg")
        XCTAssertEqual(info.artifactAppNames, ["Firefox.app"])
    }

    func testUnknownTokenReportsNotFound() async {
        do {
            _ = try await makeService(stub: Stub()).info(token: "nope", kind: .cask)
            XCTFail("expected notFound")
        } catch HomebrewServiceError.notFound { } catch { XCTFail("wrong error \(error)") }
    }

    func testOfflineGivesFriendlyError() async {
        let stub = Stub(); stub.online = false
        do {
            _ = try await makeService(stub: stub).search(query: "firefox")
            XCTFail("expected networkUnavailable")
        } catch HomebrewServiceError.networkUnavailable(let reason) {
            XCTAssertFalse(reason.isEmpty)
        } catch { XCTFail("wrong error \(error)") }
    }

    func testBrewVersionFallsBackToCatalogLabel() async throws {
        let version = try await makeService(stub: Stub()).brewVersion()
        XCTAssertEqual(version, HomebrewAPIClient.displayVersion)
    }
}

extension HomebrewAPIFallbackTests {
    func testFormulaSearchAppearsAfterBackgroundIndexIsCached() async throws {
        let stub = FormulaStub()
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("brew-api-\(UUID().uuidString)")
        let api = HomebrewAPIClient(cacheDirectory: dir, fetch: stub.fetch)
        let service = HomebrewService(apiClient: api, brewLocator: { nil })

        let first = try await service.search(query: "wget")
        XCTAssertTrue(first.allSatisfy { $0.kind == .cask }, "formulae must not block the first search")
        await api.waitForFormulaPrefetch()

        let second = try await service.search(query: "wget")
        XCTAssertEqual(second.filter { $0.kind == .formula }.map(\.token), ["wget", "wget2"])
    }

    private final class FormulaStub: @unchecked Sendable {
        func fetch(_ request: URLRequest) async throws -> (Data, URLResponse) {
            let url = request.url!
            let body: String
            switch url.lastPathComponent {
            case "cask.json": body = "[]"
            case "formula.json": body = #"[{"name":"wget2"},{"name":"wget"},{"name":"curl"}]"#
            default: body = "{}"
            }
            return (Data(body.utf8), HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
    }
}
