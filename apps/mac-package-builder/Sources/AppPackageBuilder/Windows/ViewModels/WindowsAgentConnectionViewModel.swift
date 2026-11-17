import Foundation

/// Drives the Agent Connection screen: fetches/refreshes `WindowsAgentInfo`
/// via `RemoteBuildAgentServicing.health()` and exposes it through the shared
/// `RemoteJobPhase` so the screen renders loading/error/disconnected exactly
/// like every other Windows Packaging screen.
///
/// When `WindowsAgentConnectionStore.isConfigured` is true (a valid `https`
/// base URL plus a stored bearer token), this builds a real
/// `WindowsBuildAgentClient` and uses it for the health check. Otherwise — or
/// if constructing/using that client throws — it falls back to
/// `RemoteJobPhase.disconnected` rather than silently using the in-app demo
/// client, since a real "no agent configured yet" state must be visible to
/// most AKVERMA admins who won't have a Windows Build Agent set up on day one.
@MainActor
final class WindowsAgentConnectionViewModel: ObservableObject {
    @Published var agentInfo: WindowsAgentInfo?
    @Published var connectionPhase: RemoteJobPhase = .idle

    let connectionStore: WindowsAgentConnectionStore

    /// Overrides client selection entirely, for tests / previews that want a
    /// scripted `RemoteBuildAgentServicing` regardless of store state. When
    /// `nil` (the normal app path), the client is derived from
    /// `connectionStore` fresh on every `testConnection()` call.
    private let clientOverride: RemoteBuildAgentServicing?
    private var healthTask: Task<Void, Never>?

    init(connectionStore: WindowsAgentConnectionStore, client: RemoteBuildAgentServicing? = nil) {
        self.connectionStore = connectionStore
        self.clientOverride = client
    }

    var isReady: Bool {
        if case .ready = agentInfo?.readiness { return true }
        return false
    }

    func testConnection() {
        healthTask?.cancel()

        guard let client = resolveClient() else {
            agentInfo = nil
            connectionPhase = .disconnected
            return
        }

        connectionPhase = .loading
        healthTask = Task {
            do {
                let info = try await client.health()
                guard !Task.isCancelled else { return }
                agentInfo = info
                if case .unavailable(let reason) = info.readiness {
                    connectionPhase = .error(reason)
                } else {
                    connectionPhase = .completed
                }
            } catch {
                guard !Task.isCancelled else { return }
                agentInfo = nil
                connectionPhase = .disconnected
            }
        }
    }

    /// Builds the client to use for this attempt. Returns `nil` (meaning:
    /// show `.disconnected`) whenever no agent is configured or the stored
    /// configuration can't produce a valid client.
    private func resolveClient() -> RemoteBuildAgentServicing? {
        if let clientOverride { return clientOverride }
        guard connectionStore.isConfigured, let baseURL = connectionStore.baseURL else { return nil }
        guard let token = (try? connectionStore.retrieveToken()) ?? nil, !token.isEmpty else { return nil }
        return try? WindowsBuildAgentClient(baseURL: baseURL, token: token)
    }
}
