import SwiftUI

/// The one reusable renderer for `RemoteJobPhase`, used by every screen in the
/// Windows Packaging module so loading/empty/error/disconnected/downloading/
/// validating/packaging/awaitingApproval/completed/failed/cancelled states
/// never get reinvented per screen. Callers supply the phase plus optional
/// hooks (retry, cancel, go-to-connection) that only apply to some states —
/// unused hooks are simply not rendered.
struct RemoteJobPhaseView: View {
    let phase: RemoteJobPhase
    var emptyText: String = "No results yet."
    var onRetry: (() -> Void)?
    var onCancel: (() -> Void)?

    var body: some View {
        switch phase {
        case .idle:
            EmptyView()

        case .loading:
            VStack(spacing: 10) {
                ProgressView()
                Text(phase.title).font(.callout).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(24)

        case .empty:
            VStack(spacing: 8) {
                Image(systemName: phase.systemImage)
                    .font(.system(size: 32))
                    .foregroundStyle(.secondary)
                Text(emptyText).font(.callout).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(24)

        case .disconnected:
            AgentDisconnectedBanner()

        case .downloading(let progress):
            VStack(alignment: .leading, spacing: 8) {
                Label(phase.title, systemImage: phase.systemImage)
                    .font(.callout).bold()
                ProgressView(value: max(0, min(1, progress)))
                if let onCancel {
                    Button("Cancel", role: .destructive, action: onCancel)
                        .controlSize(.small)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)

        case .validating, .packaging:
            VStack(spacing: 10) {
                ProgressView()
                Label(phase.title, systemImage: phase.systemImage).font(.callout)
            }
            .frame(maxWidth: .infinity)
            .padding(24)

        case .awaitingApproval:
            statusBanner(color: .orange)

        case .completed:
            statusBanner(color: .green)

        case .error(let message), .failed(let message):
            VStack(alignment: .leading, spacing: 8) {
                Label(phase.title, systemImage: phase.systemImage)
                    .font(.callout).bold()
                    .foregroundStyle(.red)
                Text(message).font(.caption).foregroundStyle(.secondary)
                if let onRetry {
                    Button("Retry", action: onRetry).controlSize(.small)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color.red.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 10))

        case .cancelled:
            statusBanner(color: .secondary)
        }
    }

    private func statusBanner(color: Color) -> some View {
        Label(phase.title, systemImage: phase.systemImage)
            .font(.callout).bold()
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(color.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

/// Compact, single-line variant for dense contexts like a build-jobs list row.
struct RemoteJobPhaseBadge: View {
    let phase: RemoteJobPhase

    var body: some View {
        HStack(spacing: 4) {
            if case .loading = phase {
                ProgressView().controlSize(.mini)
            } else if case .downloading = phase {
                ProgressView().controlSize(.mini)
            } else if case .validating = phase {
                ProgressView().controlSize(.mini)
            } else if case .packaging = phase {
                ProgressView().controlSize(.mini)
            } else {
                Image(systemName: phase.systemImage)
            }
            Text(phase.title).lineLimit(1)
        }
        .font(.caption).bold()
        .foregroundStyle(color)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.12))
        .clipShape(Capsule())
    }

    private var color: Color {
        switch phase {
        case .completed: return .green
        case .failed, .error: return .red
        case .cancelled: return .secondary
        case .awaitingApproval: return .orange
        default: return .blue
        }
    }
}
