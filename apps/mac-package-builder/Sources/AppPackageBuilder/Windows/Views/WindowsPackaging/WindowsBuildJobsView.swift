import SwiftUI

struct WindowsBuildJobsView: View {
    @StateObject private var viewModel = WindowsBuildJobsViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ScreenHeader(title: "Windows Build Jobs") {
                Button("Refresh", action: viewModel.refresh)
            }

            if viewModel.jobs.isEmpty {
                RemoteJobPhaseView(phase: viewModel.phase, emptyText: "No build jobs submitted yet. Start one from New Windows Package.")
            } else {
                List(viewModel.jobs) { job in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(job.kind.displayName) — \(job.packageId)").bold()
                            Text("Version \(job.version) · \(job.architecture.displayName) · \(job.scope.displayName)")
                                .font(.caption).foregroundStyle(.secondary)
                            Text("Updated \(Self.formatter.string(from: job.updatedAt))")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        Spacer()
                        RemoteJobPhaseBadge(phase: job.phase)
                        if !job.phase.isTerminal {
                            Button(role: .destructive) { viewModel.cancel(job) } label: {
                                Image(systemName: "xmark.circle")
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .listStyle(.inset)
            }
        }
        .padding(20)
        .onAppear { viewModel.refresh() }
    }

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .short
        return f
    }()
}
