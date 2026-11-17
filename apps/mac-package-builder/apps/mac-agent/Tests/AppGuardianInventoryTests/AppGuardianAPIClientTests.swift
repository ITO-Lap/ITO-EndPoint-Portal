import Foundation
import XCTest
@testable import AppGuardianAPI

private final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.requestHandler else {
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

final class AppGuardianAPIClientTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testRejectsPlainHTTPForRemoteHosts() {
        XCTAssertThrowsError(try AppGuardianAPIClient(baseURLString: "http://api.example.com/api/v1")) { error in
            XCTAssertEqual(error as? AppGuardianAPIError, .invalidBaseURL)
        }
    }

    func testAllowsHTTPSAndLoopbackDevelopmentHTTP() throws {
        XCTAssertEqual(try AppGuardianAPIClient(baseURLString: "https://api.example.com/api/v1").baseURL.host, "api.example.com")
        XCTAssertEqual(try AppGuardianAPIClient(baseURLString: "http://localhost:3000/api/v1").baseURL.port, 3000)
        XCTAssertEqual(try AppGuardianAPIClient(baseURLString: "http://[::1]:3000/api/v1").baseURL.host, "::1")
    }

    func testHealthCheckUsesConfiguredAPIBasePath() async throws {
        var observedURL: URL?
        StubURLProtocol.requestHandler = { request in
            observedURL = request.url
            return (self.response(for: request, status: 200), Data())
        }
        let client = try makeClient()

        try await client.checkConnection()

        XCTAssertEqual(observedURL?.path, "/api/v1/health")
    }

    func testHealthCheckSurfacesUnauthorizedResponse() async throws {
        StubURLProtocol.requestHandler = { request in
            (self.response(for: request, status: 401), Data())
        }
        let client = try makeClient()

        do {
            try await client.checkConnection()
            XCTFail("Expected the API status to be surfaced")
        } catch let error as AppGuardianAPIError {
            XCTAssertEqual(error, .httpStatus(401))
        }
    }

    func testInventoryUploadRequiresAccessToken() async throws {
        let client = try makeClient()
        let report = AgentInventoryReport(
            serialNumber: "SERIAL",
            hostname: "mac.local",
            currentLoggedInUser: "user",
            applications: [],
            issues: []
        )

        do {
            try await client.uploadInventory(report, bearerToken: "  ")
            XCTFail("Expected a missing token error")
        } catch let error as AppGuardianAPIError {
            XCTAssertEqual(error, .missingAccessToken)
        }
    }

    func testInventoryUploadUsesAuthenticatedAgentEndpoint() async throws {
        var observedMethod: String?
        var observedPath: String?
        var observedAuthorization: String?
        var observedContentType: String?
        StubURLProtocol.requestHandler = { request in
            observedMethod = request.httpMethod
            observedPath = request.url?.path
            observedAuthorization = request.value(forHTTPHeaderField: "Authorization")
            observedContentType = request.value(forHTTPHeaderField: "Content-Type")
            return (self.response(for: request, status: 202), Data())
        }
        let client = try makeClient()
        let report = AgentInventoryReport(
            serialNumber: "SERIAL",
            hostname: "mac.local",
            currentLoggedInUser: "user",
            applications: [],
            issues: []
        )

        try await client.uploadInventory(report, bearerToken: "short-lived-token")

        XCTAssertEqual(observedMethod, "POST")
        XCTAssertEqual(observedPath, "/api/v1/agent/inventory")
        XCTAssertEqual(observedAuthorization, "Bearer short-lived-token")
        XCTAssertEqual(observedContentType, "application/json")
    }

    private func makeClient() throws -> AppGuardianAPIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return try AppGuardianAPIClient(
            baseURLString: "https://api.example.com/api/v1",
            session: URLSession(configuration: configuration)
        )
    }

    private func response(for request: URLRequest, status: Int) -> HTTPURLResponse {
        HTTPURLResponse(url: request.url ?? URL(string: "https://invalid.example")!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
    }
}