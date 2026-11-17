import SwiftUI
import AppKit

/// The Results phase: six status indicators (five real phase outcomes, plus
/// a sixth row pinned to "Not tested" for Windows installation — this module
/// never drives a real Windows install, so that row can never show anything
/// else). The success banner only appears when the hash was actually
/// verified — never on a merely-completed-but-unverified run.
struct ResultsPhaseView: View {
    @ObservedObject var viewModel: WinTunerConfigurationViewModel

    var body: some View {
        SectionCard(title: "Packaging Results") {
            if let result = viewModel.packageResult {
                VStack(alignment: .leading, spacing: 8) {
                    RequirementRow(check: RequirementCheck(
                        name: "Manifest resolved",
                        status: result.manifestResolved ? .pass : .fail,
                        detail: result.manifestResolved ? "Resolved" : "Failed"
                    ))
                    RequirementRow(check: RequirementCheck(
                        name: "Installer downloaded",
                        status: result.installerDownloaded ? .pass : .fail,
                        detail: result.installerDownloaded ? "Downloaded" : "Not downloaded"
                    ))
                    RequirementRow(check: RequirementCheck(
                        name: "SHA-256 verified",
                        status: result.sha256Verified ? .pass : .fail,
                        detail: result.sha256Verified ? "Verified" : "Not verified"
                    ))
                    RequirementRow(check: RequirementCheck(
                        name: "Scripts generated",
                        status: result.scriptsGenerated ? .pass : .fail,
                        detail: result.scriptsGenerated ? "Generated" : "Not generated"
                    ))
                    let artifactFormats = Set(result.outputFileURLs
                        .map { $0.pathExtension.lowercased() }
                        .filter { ["intunewin", "msi"].contains($0) })
                    RequirementRow(check: RequirementCheck(
                        name: "Intune deployment artifact",
                        status: artifactFormats.isEmpty ? .fail : .pass,
                        detail: artifactFormats.isEmpty
                            ? "No .intunewin or .msi artifact found"
                            : "Created: " + artifactFormats.sorted().map { ".\($0)" }.joined(separator: ", ")
                    ))
                    // Fixed row: `windowsInstallationTested` is hardcoded
                    // `false` on `WinTunerPackageResult` — no code path in
                    // this module may ever report it as tested.
                    RequirementRow(check: RequirementCheck(
                        name: "Windows installation tested",
                        status: .warning,
                        detail: "Not tested"
                    ))
                }

                if result.sha256Verified {
                    Text("Package created and hash verified on macOS. Windows installation behavior has not been tested.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(8)
                        .background(Color.green.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .padding(.top, 8)
                }

                if !result.outputFileURLs.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Output files").font(.caption).foregroundStyle(.secondary)
                        ForEach(result.outputFileURLs, id: \.self) { url in
                            Text(url.path).font(.caption.monospaced()).textSelection(.enabled)
                        }
                    }
                    .padding(.top, 8)
                }

                HStack {
                    Button("Reveal in Finder") { revealInFinder() }
                        .disabled(result.outputFileURLs.isEmpty)
                    Button("Open Output Result") { openOutputResult() }
                        .disabled(result.outputFileURLs.isEmpty)
                    Button("Open Packaging Report") { openPackagingReport() }
                        .disabled(!(viewModel.configuration.generatePackagingReport && packagingReportURL != nil))
                    Button("Package Another Application") { viewModel.reset() }
                    Button("Retry Failed Phase") { viewModel.retryCurrentPhase() }
                }
                .padding(.top, 8)
            } else {
                Text("No packaging result is available.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var packagingReportURL: URL? {
        viewModel.packageResult?.outputFileURLs.first { $0.pathExtension.lowercased() == "html" || $0.lastPathComponent.lowercased().contains("report") }
    }

    private func revealInFinder() {
        guard let url = viewModel.packageResult?.outputFileURLs.first else { return }
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }

    private func openOutputResult() {
        guard let url = viewModel.packageResult?.outputFileURLs.first else { return }
        NSWorkspace.shared.open(url.deletingLastPathComponent())
    }

    private func openPackagingReport() {
        guard let url = packagingReportURL else { return }
        NSWorkspace.shared.open(url)
    }
}
