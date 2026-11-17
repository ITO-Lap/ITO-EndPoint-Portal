import SwiftUI

struct WindowsPackageCatalogView: View {
    @StateObject private var viewModel = WindowsPackageCatalogViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ScreenHeader(title: "Windows Package Catalog")

            if viewModel.entries.isEmpty {
                RemoteJobPhaseView(phase: viewModel.phase, emptyText: "No packages catalogued yet. Package an application to see it here.")
            } else {
                List(viewModel.entries) { entry in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(entry.winGetId).bold()
                            Text("Packaged \(entry.packagedVersion ?? "—") · Available \(entry.availableWinGetVersion ?? "—")")
                                .font(.caption).foregroundStyle(.secondary)
                            if entry.updateAvailable {
                                Label("Update available", systemImage: "arrow.triangle.2.circlepath")
                                    .font(.caption2).foregroundStyle(.orange)
                            }
                            HStack(spacing: 12) {
                                if let lastChecked = entry.lastChecked {
                                    Text("Checked \(Self.formatter.string(from: lastChecked))").font(.caption2).foregroundStyle(.secondary)
                                }
                                if let lastPackaged = entry.lastPackaged {
                                    Text("Packaged \(Self.formatter.string(from: lastPackaged))").font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 4) {
                            approvalBadge(entry.approvalState)
                            if let validation = entry.validationResult {
                                Label(validation.hashMatches ? "Validated" : "Validation Failed", systemImage: validation.hashMatches ? "checkmark.shield" : "xmark.shield")
                                    .font(.caption2)
                                    .foregroundStyle(validation.hashMatches ? .green : .red)
                            }
                            if let build = entry.buildResult {
                                RemoteJobPhaseBadge(phase: build.phase)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                .listStyle(.inset)
            }
        }
        .padding(20)
        .onAppear { viewModel.load() }
    }

    private func approvalBadge(_ state: WindowsCatalogEntry.ApprovalState) -> some View {
        Text(state.displayName)
            .font(.caption2).bold()
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(approvalColor(state).opacity(0.15))
            .foregroundStyle(approvalColor(state))
            .clipShape(Capsule())
    }

    private func approvalColor(_ state: WindowsCatalogEntry.ApprovalState) -> Color {
        switch state {
        case .pending: return .orange
        case .approved: return .green
        case .rejected: return .red
        }
    }

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .none
        return f
    }()
}
