import AppKit
import SwiftUI

/// Step 8: previews the Endpoint Central export folder layout and triggers
/// export. The real assembly (`WindowsPackageExportService`) is a later
/// phase — this is a stub that reports success, per the brief.
struct ExportStep: View {
    @ObservedObject var viewModel: WindowsPackageWizardViewModel

    private var checklist: [(name: String, included: Bool)] {
        [
            ("Installer/", true),
            ("Install.ps1", true),
            ("Uninstall.ps1", true),
            ("Detect.ps1", true),
            ("Requirements.ps1", true),
            ("Package.intunewin", viewModel.exportRequestsIntunewin),
            ("Manifest.json", true),
            ("Validation-Report.html", true),
            ("Intune-Deployment-Guide.txt", true),
            ("EndpointCentral-Deployment-Guide.txt", true),
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionCard(title: "Export Folder Preview") {
                VStack(alignment: .leading, spacing: 6) {
                    Toggle("Include Package.intunewin", isOn: $viewModel.exportRequestsIntunewin)
                    Divider()
                    ForEach(checklist, id: \.name) { item in
                        Label(item.name, systemImage: item.included ? "checkmark.square.fill" : "square")
                            .font(.system(.callout, design: .monospaced))
                            .foregroundStyle(item.included ? .primary : .secondary)
                    }
                }
            }

            // Prompts for a destination folder, fetches the installer (and
            // .intunewin, if requested) from the agent, and assembles the
            // export folder via `WindowsPackageExportService`. Fails with a
            // real reason (surfaced via `exportPhase`) rather than a fake
            // success if an artifact isn't actually available yet.
            Button("Export") { viewModel.runExport() }
                .buttonStyle(.borderedProminent)

            RemoteJobPhaseView(phase: viewModel.exportPhase)

            if viewModel.exportPhase == .completed, let exportRoot = viewModel.lastExportRoot {
                Button("Reveal in Finder") {
                    NSWorkspace.shared.activateFileViewerSelecting([exportRoot])
                }
            }
        }
    }
}
