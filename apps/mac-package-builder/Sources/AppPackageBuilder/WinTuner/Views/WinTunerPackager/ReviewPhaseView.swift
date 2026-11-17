import SwiftUI

/// The Review phase: a table of every resolved manifest field, a
/// missing-metadata callout, and an explicit confirm button before any
/// download/packaging begins. Never auto-advances into packaging.
struct ReviewPhaseView: View {
    @ObservedObject var viewModel: WinTunerConfigurationViewModel

    var body: some View {
        SectionCard(title: "Review Resolved Manifest") {
            if let manifest = viewModel.resolvedManifest {
                VStack(alignment: .leading, spacing: 8) {
                    fieldRow("Package ID", manifest.packageId)
                    fieldRow("Version", manifest.version)
                    fieldRow("Installer URL", manifest.installerURL.absoluteString)
                    fieldRow("Installer Type", manifest.installerType.displayName)
                    fieldRow("Architecture", manifest.architecture.displayName)
                    fieldRow("Scope", manifest.scope?.displayName ?? "Not specified")
                    fieldRow("SHA-256", manifest.sha256 ?? "Not provided")
                    fieldRow("Silent Install Switches", manifest.silentInstallSwitches ?? "Not provided")
                    fieldRow("Silent Uninstall Switches", manifest.silentUninstallSwitches ?? "Not provided")
                    fieldRow("Upgrade Code", manifest.upgradeCode ?? "Not provided")
                    fieldRow("Product Code", manifest.productCode ?? "Not provided")
                    fieldRow("Expected Output Name", manifest.expectedOutputName ?? "Not provided")
                }
                .padding(.bottom, 8)

                if !manifest.missingFields.isEmpty {
                    HStack(alignment: .top, spacing: 6) {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                        Text("Missing metadata: \(manifest.missingFields.joined(separator: ", ")).")
                            .font(.caption)
                        Spacer()
                    }
                    .padding(8)
                    .background(Color.orange.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .padding(.bottom, 8)
                }

                if let preflight = viewModel.preflight {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Pre-package checks").font(.caption.bold())
                        ForEach(preflight.checks) { check in
                            HStack(alignment: .top, spacing: 6) {
                                Image(systemName: icon(check.severity)).foregroundStyle(color(check.severity))
                                Text("\(check.title): \(check.detail)").font(.caption)
                                Spacer()
                            }
                        }
                        if preflight.needsAcknowledgement {
                            Toggle("I understand this install command is not verified and must be tested before deployment",
                                   isOn: $viewModel.acknowledgedUnverifiedCommand)
                                .toggleStyle(.checkbox).font(.caption)
                        }
                    }
                    .padding(.bottom, 8)
                }

                if let runError = viewModel.runError {
                    Text(runError).font(.caption).foregroundStyle(.red)
                        .padding(.bottom, 4)
                }

                HStack {
                    Button("Back") { viewModel.phase = .configure }
                        .buttonStyle(.plain)
                        .font(.caption)
                    Spacer()
                    Button("Proceed to Packaging") {
                        Task { await viewModel.beginPackaging() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!viewModel.canBeginPackaging)
                }
            } else {
                Text("No manifest has been resolved yet.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func icon(_ s: WinTunerPreflight.Severity) -> String {
        switch s {
        case .ok: return "checkmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .blocking: return "xmark.octagon.fill"
        }
    }

    private func color(_ s: WinTunerPreflight.Severity) -> Color {
        switch s {
        case .ok: return .green
        case .warning: return .orange
        case .blocking: return .red
        }
    }

    private func fieldRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 180, alignment: .leading)
            Text(value)
                .font(.caption.monospaced())
                .textSelection(.enabled)
            Spacer()
        }
    }
}
