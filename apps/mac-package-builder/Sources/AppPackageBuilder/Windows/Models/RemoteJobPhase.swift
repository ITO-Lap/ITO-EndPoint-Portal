import Foundation

/// Shared UI state for every screen in the Windows WinGet Packaging module.
/// Rather than each screen (agent connection, catalog search, wizard steps,
/// build jobs, package catalog) inventing its own loading/empty/error enum,
/// they all render from this one type via a shared `RemoteJobPhaseView`
/// (added by a later agent). Keeping it in one place means adding a new
/// required state (e.g. `awaitingApproval`) only has to happen once.
enum RemoteJobPhase: Equatable, Codable {
    case idle
    case loading
    case empty
    case error(String)
    case disconnected
    case downloading(progress: Double)
    case validating
    case packaging
    case awaitingApproval
    case completed
    case failed(String)
    case cancelled

    /// Short, user-facing label for the current state.
    var title: String {
        switch self {
        case .idle: return "Idle"
        case .loading: return "Loading…"
        case .empty: return "No Results"
        case .error: return "Error"
        case .disconnected: return "Agent Disconnected"
        case .downloading(let progress): return "Downloading (\(Int(progress * 100))%)"
        case .validating: return "Validating"
        case .packaging: return "Packaging"
        case .awaitingApproval: return "Awaiting Approval"
        case .completed: return "Completed"
        case .failed: return "Failed"
        case .cancelled: return "Cancelled"
        }
    }

    /// SF Symbol name suitable for a status icon next to `title`.
    var systemImage: String {
        switch self {
        case .idle: return "circle.dashed"
        case .loading: return "arrow.triangle.2.circlepath"
        case .empty: return "tray"
        case .error: return "exclamationmark.triangle.fill"
        case .disconnected: return "bolt.horizontal.circle"
        case .downloading: return "arrow.down.circle"
        case .validating: return "checkmark.shield"
        case .packaging: return "shippingbox"
        case .awaitingApproval: return "hourglass"
        case .completed: return "checkmark.circle.fill"
        case .failed: return "xmark.octagon.fill"
        case .cancelled: return "slash.circle"
        }
    }

    /// A message to surface to the user, when this phase carries one.
    var message: String? {
        switch self {
        case .error(let message), .failed(let message):
            return message
        default:
            return nil
        }
    }

    /// Whether this phase represents an end state — no further transitions
    /// are expected without the user starting a new operation.
    var isTerminal: Bool {
        switch self {
        case .completed, .failed, .cancelled:
            return true
        default:
            return false
        }
    }
}
