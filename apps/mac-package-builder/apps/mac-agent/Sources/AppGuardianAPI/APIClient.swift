import Foundation
import AppGuardianInventory

public struct AgentInventoryReport: Codable, Sendable {
    public let serialNumber: String
    public let hostname: String
    public let currentLoggedInUser: String
    public let scannedAt: Date
    public let applications: [InstalledApplication]
    public let issues: [InventoryScanIssue]

    public init(
        serialNumber: String,
        hostname: String,
        currentLoggedInUser: String,
        scannedAt: Date = .now,
        applications: [InstalledApplication],
        issues: [InventoryScanIssue]
    ) {
        self.serialNumber = serialNumber
        self.hostname = hostname
        self.currentLoggedInUser = currentLoggedInUser
        self.scannedAt = scannedAt
        self.applications = applications
        self.issues = issues
    }
}

public struct AppGuardianAPIClient: Sendable {
    public let baseURL: URL
    private let session: URLSession

    public init(baseURLString: String, session: URLSession = .shared) throws {
        let trimmed = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let scheme = components.scheme?.lowercased(),
              let host = components.host,
              components.user == nil,
              components.password == nil,
              components.query == nil,
              components.fragment == nil,
              scheme == "https" || (scheme == "http" && Self.isLoopback(host)) else {
            throw AppGuardianAPIError.invalidBaseURL
        }
        self.baseURL = url
        self.session = session
    }

    public func checkConnection() async throws {
        let request = URLRequest(url: baseURL.appendingPathComponent("health"), timeoutInterval: 10)
        let (_, response) = try await session.data(for: request)
        try validate(response)
    }

    public func uploadInventory(_ report: AgentInventoryReport, bearerToken: String) async throws {
        let token = bearerToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else { throw AppGuardianAPIError.missingAccessToken }

        var request = URLRequest(url: baseURL.appendingPathComponent("agent/inventory"), timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        request.httpBody = try encoder.encode(report)
        let (_, response) = try await session.data(for: request)
        try validate(response)
    }

    private func validate(_ response: URLResponse) throws {
        guard let response = response as? HTTPURLResponse else {
            throw AppGuardianAPIError.invalidResponse
        }
        guard (200..<300).contains(response.statusCode) else {
            throw AppGuardianAPIError.httpStatus(response.statusCode)
        }
    }

    private static func isLoopback(_ host: String) -> Bool {
        let normalized = host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        return normalized == "localhost" || normalized == "127.0.0.1" || normalized == "::1"
    }
}

public enum AppGuardianAPIError: LocalizedError, Equatable {
    case invalidBaseURL
    case invalidResponse
    case missingAccessToken
    case httpStatus(Int)

    public var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "Enter an HTTPS API base URL. HTTP is permitted only for localhost development."
        case .invalidResponse:
            return "The API returned an invalid response."
        case .missingAccessToken:
            return "Save a short-lived access token in Keychain before uploading inventory."
        case .httpStatus(let status):
            return "The API returned HTTP \(status). Confirm that the App Guardian API is deployed and the token has permission."
        }
    }
}