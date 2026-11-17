import SwiftUI

/// Step 3: configure download parameters and submit the download job.
struct DownloadStep: View {
    @ObservedObject var viewModel: WindowsPackageWizardViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionCard(title: "Download Options") {
                VStack(alignment: .leading, spacing: 10) {
                    Picker("Architecture", selection: $viewModel.architecture) {
                        ForEach(WinGetPackageDetail.Architecture.allCases) { arch in
                            Text(arch.displayName).tag(arch)
                        }
                    }
                    Picker("Scope", selection: $viewModel.scope) {
                        ForEach(WinGetPackageDetail.InstallerScope.allCases) { scope in
                            Text(scope.displayName).tag(scope)
                        }
                    }
                    Picker("Installer Type", selection: $viewModel.installerType) {
                        ForEach(WinGetPackageDetail.InstallerType.allCases) { type in
                            Text(type.displayName).tag(type)
                        }
                    }
                    TextField("Locale", text: $viewModel.locale)
                    TextField("Source", text: .constant(viewModel.selectedDetail?.source ?? "winget"))
                        .disabled(true)
                    HStack {
                        Text("Download size").foregroundStyle(.secondary)
                        Spacer()
                        Text("~ 120 MB (estimated)").foregroundStyle(.secondary)
                    }
                    .font(.caption)
                }
            }

            if viewModel.downloadJob == nil {
                Button("Start Download") { viewModel.startDownload() }
                    .buttonStyle(.borderedProminent)
                    .disabled(viewModel.selectedDetail == nil || viewModel.selectedVersion == nil)
            } else {
                RemoteJobPhaseView(
                    phase: viewModel.downloadPhase,
                    onRetry: { viewModel.startDownload() },
                    onCancel: { viewModel.cancelDownload() }
                )
            }
        }
    }
}
