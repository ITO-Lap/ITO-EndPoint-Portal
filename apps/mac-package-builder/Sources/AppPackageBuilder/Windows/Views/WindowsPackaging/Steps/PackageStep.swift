import SwiftUI

/// Step 6: submits the packaging job and shows progress via
/// `RemoteJobPhaseView`.
struct PackageStep: View {
    @ObservedObject var viewModel: WindowsPackageWizardViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionCard(title: "Configuration Summary") {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Install: \(viewModel.configuration.installCommand)").font(.caption)
                    Text("Uninstall: \(viewModel.configuration.uninstallCommand)").font(.caption)
                    Text("Detection rules: \(viewModel.configuration.detectionRules.count)").font(.caption)
                }
                .foregroundStyle(.secondary)
            }

            if viewModel.packageJob == nil {
                Button("Start Packaging") { viewModel.startPackaging() }
                    .buttonStyle(.borderedProminent)
            } else {
                RemoteJobPhaseView(phase: viewModel.packagePhase, onRetry: { viewModel.startPackaging() })
            }
        }
    }
}
