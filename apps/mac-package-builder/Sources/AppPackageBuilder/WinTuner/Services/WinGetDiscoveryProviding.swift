import Foundation

enum WinGetDiscoveryError: LocalizedError {
    case offline
    case rateLimited
    case other(String)

    var errorDescription: String? {
        switch self {
        case .offline:
            return "Could not reach the WinGet manifest source. Check your internet connection."
        case .rateLimited:
            return "The manifest source is rate-limiting unauthenticated requests right now. Try again shortly."
        case .other(let message):
            return message
        }
    }
}

/// A source of `WinGetManifestPackage` search results. Implementations must
/// never fabricate results — an empty array, not a guess, is the correct
/// response when a provider has no confident match.
protocol WinGetDiscoveryProviding {
    func search(query: String) async throws -> [WinGetManifestPackage]
}
