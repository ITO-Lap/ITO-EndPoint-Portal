import Foundation
import SwiftUI

/// Non-sensitive Windows Build Agent connection settings (host/port/display
/// name), backed by `@AppStorage`/`UserDefaults` exactly like `SettingsStore`.
/// The bearer token is never stored here — it lives only in the Keychain via
/// `KeychainStoring`, the same separation `SettingsStore`'s doc comment
/// describes for signing/notarization credentials.
@MainActor
final class WindowsAgentConnectionStore: ObservableObject {
    @AppStorage("windowsAgentHost") var host: String = ""
    @AppStorage("windowsAgentPort") var port: Int = 8443
    @AppStorage("windowsAgentDisplayName") var displayName: String = ""

    private let keychain: KeychainStoring

    /// Fixed account name: this app manages exactly one Windows Build Agent
    /// connection today. If multi-agent support is added later, this becomes
    /// derived from a per-agent identifier instead.
    private let tokenAccount = "windows-build-agent-token"

    init(keychain: KeychainStoring = KeychainStore()) {
        self.keychain = keychain
    }

    /// Persists the bearer token to the Keychain. Never written to
    /// `UserDefaults` or any other non-Keychain storage.
    func storeToken(_ token: String) throws {
        try keychain.setSecret(token, account: tokenAccount)
    }

    /// Reads the bearer token back from the Keychain, or `nil` if none has
    /// been stored yet.
    func retrieveToken() throws -> String? {
        try keychain.getSecret(account: tokenAccount)
    }

    /// Removes the stored bearer token from the Keychain.
    func clearToken() throws {
        try keychain.deleteSecret(account: tokenAccount)
    }

    /// The agent's base URL, built from `host`/`port`. `nil` whenever host is
    /// blank, port is out of range, or the resulting URL would not use
    /// `https` — plaintext HTTP is never allowed for a connection carrying a
    /// bearer token.
    var baseURL: URL? {
        let trimmedHost = host.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedHost.isEmpty, port > 0, port <= 65535 else { return nil }
        var components = URLComponents()
        components.scheme = "https"
        components.host = trimmedHost
        components.port = port
        guard let url = components.url, url.scheme == "https" else { return nil }
        return url
    }

    /// Whether enough has been configured (a valid https base URL and a
    /// stored token) to attempt a real connection.
    var isConfigured: Bool {
        guard baseURL != nil else { return false }
        let token = try? retrieveToken()
        return (token?.isEmpty == false)
    }

    /// Builds "the current client" for every Windows Packaging ViewModel:
    /// a real `WindowsBuildAgentClient` when this store holds a valid `https`
    /// base URL and a non-empty stored bearer token, or `DemoBuildAgentClient()`
    /// otherwise — never `nil`, so the rest of the app never has to special-case
    /// "no client available" the way the Agent Connection screen's disconnected
    /// state does. Mirrors `WindowsAgentConnectionViewModel.resolveClient()`,
    /// just without that screen's need to distinguish "not configured" from a
    /// working demo client.
    func makeClient() -> RemoteBuildAgentServicing {
        guard isConfigured, let baseURL,
              let token = (try? retrieveToken()) ?? nil, !token.isEmpty,
              let client = try? WindowsBuildAgentClient(baseURL: baseURL, token: token)
        else {
            return DemoBuildAgentClient()
        }
        return client
    }
}
