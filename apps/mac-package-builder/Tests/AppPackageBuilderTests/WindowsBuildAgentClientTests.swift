import XCTest
@testable import AppPackageBuilder

/// Intercepts every request made through a `URLSession` configured with this
/// protocol registered, so `WindowsBuildAgentClientTests` never touches the
/// real network. Mirrors the standard `URLProtocol`-mocking idiom: install a
/// `requestHandler` before the request, capture the request it was given,
/// and hand back a canned response.
final class MockURLProtocol: URLProtocol {
    /// Set by each test before exercising the client. Returns the response
    /// and body to hand back for the given request.
    static var requestHandler: (@Sendable (URLRequest) throws -> (HTTPURLResponse, Data))?

    /// Captures the most recent request this protocol was asked to load, so
    /// tests can assert on headers/URL/method/body after the call completes.
    static var lastRequest: URLRequest?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        MockURLProtocol.lastRequest = request
        guard let handler = MockURLProtocol.requestHandler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

final class WindowsBuildAgentClientTests: XCTestCase {

    private let baseURL = URL(string: "https://agent.example.internal:8443")!

    private func makeMockedSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: config)
    }

    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        MockURLProtocol.lastRequest = nil
        super.tearDown()
    }

    // MARK: - Construction

    func testHTTPSOnlyConstructionRejectsPlainHTTPBaseURL() {
        let httpURL = URL(string: "http://agent.example.internal:8443")!
        XCTAssertThrowsError(try WindowsBuildAgentClient(baseURL: httpURL, token: "secret")) { error in
            guard let clientError = error as? WindowsBuildAgentClientError else {
                return XCTFail("expected WindowsBuildAgentClientError, got \(error)")
            }
            guard case .invalidBaseURL = clientError else {
                return XCTFail("expected .invalidBaseURL, got \(clientError)")
            }
        }
    }

    func testHTTPSConstructionSucceeds() {
        XCTAssertNoThrow(try WindowsBuildAgentClient(baseURL: baseURL, token: "secret"))
    }

    func testConstructionRejectsMissingHost() throws {
        let noHostURL = try XCTUnwrap(URL(string: "https://"))
        XCTAssertThrowsError(try WindowsBuildAgentClient(baseURL: noHostURL, token: "secret"))
    }

    // MARK: - Request shaping

    func testHealthRequestSetsBearerAuthorizationHeader() async throws {
        let session = makeMockedSession()
        let client = try WindowsBuildAgentClient(baseURL: baseURL, token: "s3cr3t-token", session: session)

        let healthJSON = """
        {"agentName":"agent-1","windowsVersion":"10.0.19045","winGetVersion":"1.7.0","intuneWinAppUtilStatus":"available","lastHeartbeat":null,"availableDiskSpaceBytes":null}
        """
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, Data(healthJSON.utf8))
        }

        _ = try await client.health()

        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer s3cr3t-token")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/health")
    }

    func testSearchRequestNeverExposesTokenInURL() async throws {
        let session = makeMockedSession()
        let client = try WindowsBuildAgentClient(baseURL: baseURL, token: "s3cr3t-token", session: session)

        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, Data("[]".utf8))
        }

        _ = try await client.searchPackages(query: "vscode", source: "winget")

        let url = try XCTUnwrap(MockURLProtocol.lastRequest?.url)
        XCTAssertFalse(url.absoluteString.contains("s3cr3t-token"))
        XCTAssertEqual(url.path, "/winget/search")
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertTrue(items.contains(URLQueryItem(name: "query", value: "vscode")))
        XCTAssertTrue(items.contains(URLQueryItem(name: "source", value: "winget")))
    }

    // MARK: - Error mapping

    func test401MapsToUnauthorized() async throws {
        let session = makeMockedSession()
        let client = try WindowsBuildAgentClient(baseURL: baseURL, token: "bad-token", session: session)

        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!
            return (response, Data())
        }

        do {
            _ = try await client.health()
            XCTFail("expected .unauthorized")
        } catch let error as WindowsBuildAgentClientError {
            XCTAssertEqual(error, .unauthorized)
        }
    }

    func test403AlsoMapsToUnauthorized() async throws {
        let session = makeMockedSession()
        let client = try WindowsBuildAgentClient(baseURL: baseURL, token: "bad-token", session: session)

        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!
            return (response, Data())
        }

        do {
            _ = try await client.health()
            XCTFail("expected .unauthorized")
        } catch let error as WindowsBuildAgentClientError {
            XCTAssertEqual(error, .unauthorized)
        }
    }

    func testMalformedJSONMapsToDecodingFailed() async throws {
        let session = makeMockedSession()
        let client = try WindowsBuildAgentClient(baseURL: baseURL, token: "token", session: session)

        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, Data("{ not valid json ]".utf8))
        }

        do {
            _ = try await client.health()
            XCTFail("expected .decodingFailed")
        } catch let error as WindowsBuildAgentClientError {
            guard case .decodingFailed = error else {
                return XCTFail("expected .decodingFailed, got \(error)")
            }
        }
    }

    func testServerErrorStatusMapsToServerErrorWithBody() async throws {
        let session = makeMockedSession()
        let client = try WindowsBuildAgentClient(baseURL: baseURL, token: "token", session: session)

        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!
            return (response, Data("winget crashed".utf8))
        }

        do {
            _ = try await client.health()
            XCTFail("expected .serverError")
        } catch let error as WindowsBuildAgentClientError {
            guard case .serverError(let message) = error else {
                return XCTFail("expected .serverError, got \(error)")
            }
            XCTAssertTrue(message.contains("winget crashed"))
        }
    }

    func testTransportFailureMapsToUnreachable() async throws {
        let session = makeMockedSession()
        let client = try WindowsBuildAgentClient(baseURL: baseURL, token: "token", session: session)

        MockURLProtocol.requestHandler = { _ in
            throw URLError(.cannotConnectToHost)
        }

        do {
            _ = try await client.health()
            XCTFail("expected .unreachable")
        } catch let error as WindowsBuildAgentClientError {
            guard case .unreachable = error else {
                return XCTFail("expected .unreachable, got \(error)")
            }
        }
    }
}
