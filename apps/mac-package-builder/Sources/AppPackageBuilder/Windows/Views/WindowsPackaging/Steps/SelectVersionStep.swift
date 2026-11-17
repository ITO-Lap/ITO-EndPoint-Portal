import SwiftUI

/// Step 2: choose which available version of the selected package to build.
struct SelectVersionStep: View {
    @ObservedObject var viewModel: WindowsPackageWizardViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if case .loading = viewModel.detailPhase {
                RemoteJobPhaseView(phase: .loading)
            } else if let detail = viewModel.selectedDetail {
                Text("Available versions for \(detail.name)").font(.callout).foregroundStyle(.secondary)
                ForEach(detail.availableVersions, id: \.self) { version in
                    Button {
                        viewModel.selectedVersion = version
                    } label: {
                        HStack {
                            Image(systemName: viewModel.selectedVersion == version ? "largecircle.fill.circle" : "circle")
                            Text(version)
                            if version == detail.latestVersion {
                                Text("Latest").font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(8)
                        .background(.background.secondary)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }
            } else {
                RemoteJobPhaseView(phase: .empty, emptyText: "Select an application first.")
            }
        }
    }
}
