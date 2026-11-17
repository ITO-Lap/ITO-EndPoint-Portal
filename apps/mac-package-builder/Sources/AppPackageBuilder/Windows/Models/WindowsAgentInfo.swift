import Foundation

/// Snapshot of the remote Windows Build Agent's health, returned by
/// `RemoteBuildAgentServicing.health()` and rendered on the Agent Connection
/// screen so a missing/unhealthy agent is diagnosable at a glance.
struct WindowsAgentInfo: Codable, Equatable {
    var agentName: String
    var windowsVersion: String
    var winGetVersion: String
    var intuneWinAppUtilStatus: IntuneWinAppUtilStatus
    var lastHeartbeat: Date?
    var availableDiskSpaceBytes: Int64?

    /// Whether `IntuneWinAppUtil.exe` (required to produce `.intunewin`
    /// packages) is configured and reachable on the agent host.
    enum IntuneWinAppUtilStatus: String, Codable, CaseIterable {
        case available
        case notConfigured
        case notFound

        var displayName: String {
            switch self {
            case .available: return "Available"
            case .notConfigured: return "Not Configured"
            case .notFound: return "Not Found"
            }
        }
    }

    /// Overall readiness of the agent for accepting new jobs.
    enum Readiness: Equatable {
        case ready
        case unavailable(reason: String)
    }

    /// A heartbeat is considered stale (and the agent effectively
    /// unreachable) once it's older than this, even if the last HTTP call
    /// technically succeeded.
    static let heartbeatStaleness: TimeInterval = 120

    /// Derived from heartbeat recency and `IntuneWinAppUtil` configuration —
    /// the two conditions that make the agent unusable for a build even when
    /// the connection itself is reachable.
    var readiness: Readiness {
        guard let lastHeartbeat else {
            return .unavailable(reason: "No heartbeat received from the agent yet.")
        }
        let age = Date().timeIntervalSince(lastHeartbeat)
        guard age <= Self.heartbeatStaleness else {
            return .unavailable(reason: "Agent heartbeat is stale (last seen \(Int(age))s ago).")
        }
        switch intuneWinAppUtilStatus {
        case .available:
            return .ready
        case .notConfigured:
            return .unavailable(reason: "IntuneWinAppUtil is not configured on the agent.")
        case .notFound:
            return .unavailable(reason: "IntuneWinAppUtil.exe could not be found on the agent.")
        }
    }
}
