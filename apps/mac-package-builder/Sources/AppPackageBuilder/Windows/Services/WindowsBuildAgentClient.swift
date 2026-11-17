import Foundation

/// Errors surfaced by `WindowsBuildAgentClient`, mapped from transport
/// failures, non-2xx HTTP responses, and decoding failures. Never carries the
/// bearer token in any associated value.
enum WindowsBuildAgentClientError: LocalizedError, Equatable {
    case invalidBaseURL(String)
    case unreachable(String)
    case unauthorized
    case invalidResponse
    case serverError(String)
    case decodingFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL(let reason):
            return "Invalid Windows Build Agent URL: \(reason)"
        case .unreachable(let reason):
            return "Could not reach the Windows Build Agent: \(reason)"
        case .unauthorized:
            return "The Windows Build Agent rejected the configured bearer token."
        case .invalidResponse:
            return "The Windows Build Agent returned a response that could not be understood."
        case .serverError(let message):
            return "Windows Build Agent error: \(message)"
        case .decodingFailed(let reason):
            return "Could not parse the Windows Build Agent's response: \(reason)"
        }
    }
}

/// `URLSession`-backed implementation of `RemoteBuildAgentServicing` — the
/// app's first real remote-network service. Every call is an authenticated
/// HTTPS request to a purpose-built Windows Build Agent; `winget`,
/// PowerShell, Authenticode validation, and `IntuneWinAppUtil.exe` never run
/// on macOS. This is deliberately the only place in the app that speaks to
/// that agent over the network — if a second remote-backend implementation
/// is ever added (per the plan's "another remote build implementation can be
/// added later"), it would conform to the same `RemoteBuildAgentServicing`
/// protocol and slot in here without touching any call site.
///
/// The bearer token is held only in memory for the lifetime of this instance
/// and is never written to a log line, `print`, or error message.
final class WindowsBuildAgentClient: RemoteBuildAgentServicing {
    private let baseURL: URL
    private let token: String
    private let session: URLSession

    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    /// Validates `baseURL` at construction time — `https` only, never
    /// plaintext `http` — so an invalid client can never be built and later
    /// silently used.
    init(baseURL: URL, token: String, session: URLSession = .shared) throws {
        guard baseURL.scheme?.lowercased() == "https" else {
            throw WindowsBuildAgentClientError.invalidBaseURL("scheme must be https, got \"\(baseURL.scheme ?? "none")\"")
        }
        guard let host = baseURL.host, !host.isEmpty else {
            throw WindowsBuildAgentClientError.invalidBaseURL("missing host")
        }
        self.baseURL = baseURL
        self.token = token
        self.session = session
    }

    // MARK: - RemoteBuildAgentServicing

    func health() async throws -> WindowsAgentInfo {
        try await get("health")
    }

    func searchPackages(query: String, source: String?) async throws -> [WinGetPackage] {
        var items = [URLQueryItem(name: "query", value: query)]
        if let source {
            items.append(URLQueryItem(name: "source", value: source))
        }
        return try await get("winget/search", queryItems: items)
    }

    func packageDetail(id: String) async throws -> WinGetPackageDetail {
        guard let encodedId = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
            throw WindowsBuildAgentClientError.invalidBaseURL("package id could not be encoded")
        }
        return try await get("winget/packages/\(encodedId)")
    }

    func submitDownloadJob(
        packageId: String,
        version: String,
        architecture: WinGetPackageDetail.Architecture,
        scope: WinGetPackageDetail.InstallerScope,
        locale: String?
    ) async throws -> WindowsBuildJob {
        let body = DownloadJobRequest(packageId: packageId, version: version, architecture: architecture, scope: scope, locale: locale, source: "winget")
        return try await post("jobs/download", body: body)
    }

    func submitDownloadJob(
        packageId: String,
        version: String,
        architecture: WinGetPackageDetail.Architecture,
        scope: WinGetPackageDetail.InstallerScope,
        locale: String?,
        source: String
    ) async throws -> WindowsBuildJob {
        let body = DownloadJobRequest(packageId: packageId, version: version, architecture: architecture, scope: scope, locale: locale, source: source)
        return try await post("jobs/download", body: body)
    }

    func submitPackageJob(configuration: WindowsPackageConfiguration, sourceJobId: UUID) async throws -> WindowsBuildJob {
        let body = PackageJobRequest(configuration: configuration, sourceJobId: sourceJobId)
        return try await post("jobs/package", body: body)
    }

    func jobStatus(id: UUID) async throws -> WindowsBuildJob {
        try await get("jobs/\(id.uuidString)")
    }

    func cancelJob(id: UUID) async throws {
        let request = try makeRequest(path: "jobs/\(id.uuidString)/cancel", method: "POST")
        _ = try await execute(request)
    }

    func fetchArtifact(jobId: UUID, name: String) async throws -> URL {
        guard let encodedName = name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
            throw WindowsBuildAgentClientError.invalidBaseURL("artifact name could not be encoded")
        }
        let request = try makeRequest(path: "jobs/\(jobId.uuidString)/artifacts", method: "GET", queryItems: [URLQueryItem(name: "name", value: encodedName)])

        let tempURL: URL
        let response: URLResponse
        do {
            (tempURL, response) = try await session.download(for: request)
        } catch {
            throw WindowsBuildAgentClientError.unreachable(error.localizedDescription)
        }
        try validate(response)

        // `URLSession.download` deletes its temp file as soon as this scope
        // returns, so move it somewhere durable before handing the URL back.
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("WindowsBuildAgentArtifact-\(UUID().uuidString)-\(name)")
        if FileManager.default.fileExists(atPath: destination.path) {
            try? FileManager.default.removeItem(at: destination)
        }
        try FileManager.default.moveItem(at: tempURL, to: destination)
        return destination
    }

    // MARK: - Request plumbing

    private struct DownloadJobRequest: Encodable {
        let packageId: String
        let version: String
        let architecture: WinGetPackageDetail.Architecture
        let scope: WinGetPackageDetail.InstallerScope
        let locale: String?
        let source: String
    }

    private struct PackageJobRequest: Encodable {
        let configuration: WindowsPackageConfiguration
        let sourceJobId: UUID
    }

    private func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem] = []) async throws -> T {
        let request = try makeRequest(path: path, method: "GET", queryItems: queryItems)
        let data = try await execute(request)
        return try decode(T.self, from: data)
    }

    private func post<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T {
        var request = try makeRequest(path: path, method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            request.httpBody = try encoder.encode(body)
        } catch {
            throw WindowsBuildAgentClientError.decodingFailed("could not encode request body: \(error.localizedDescription)")
        }
        let data = try await execute(request)
        return try decode(T.self, from: data)
    }

    private func makeRequest(path: String, method: String, queryItems: [URLQueryItem] = []) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
            throw WindowsBuildAgentClientError.invalidBaseURL("could not build request URL for \(path)")
        }
        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }
        guard let url = components.url else {
            throw WindowsBuildAgentClientError.invalidBaseURL("could not build request URL for \(path)")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    /// Runs `request` and returns the raw response body after status
    /// validation. Does not log `request` (which carries the Authorization
    /// header) under any circumstances.
    private func execute(_ request: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw WindowsBuildAgentClientError.unreachable(error.localizedDescription)
        }
        try validate(response, data: data)
        return data
    }

    private func validate(_ response: URLResponse, data: Data? = nil) throws {
        guard let http = response as? HTTPURLResponse else {
            throw WindowsBuildAgentClientError.invalidResponse
        }
        switch http.statusCode {
        case 200..<300:
            return
        case 401, 403:
            throw WindowsBuildAgentClientError.unauthorized
        default:
            let message: String
            if let data, let body = String(data: data, encoding: .utf8), !body.isEmpty {
                message = "HTTP \(http.statusCode): \(body)"
            } else {
                message = "HTTP \(http.statusCode)"
            }
            throw WindowsBuildAgentClientError.serverError(message)
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try decoder.decode(type, from: data)
        } catch {
            throw WindowsBuildAgentClientError.decodingFailed(error.localizedDescription)
        }
    }
}
