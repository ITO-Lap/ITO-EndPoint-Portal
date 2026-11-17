import SwiftUI
import AppKit

/// The Configure phase: every field of `WinTunerPackageConfiguration`.
/// Reuses the exact `NSOpenPanel` output-directory picker pattern from
/// `ConfigurationSection` (the macOS Homebrew flow).
struct ConfigurePhaseView: View {
    @ObservedObject var viewModel: WinTunerConfigurationViewModel

    private let grid = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        SectionCard(title: "Configure Package") {
            LazyVGrid(columns: grid, alignment: .leading, spacing: 14) {
                labeledField("Version") {
                    TextField("1.0.0", text: $viewModel.configuration.version)
                        .textFieldStyle(.roundedBorder)
                }
                labeledField("Architecture") {
                    Picker("", selection: $viewModel.configuration.architecture) {
                        ForEach(WinGetArchitecture.allCases) { arch in
                            Text(arch.displayName).tag(arch)
                        }
                    }
                    .labelsHidden()
                }
                labeledField("Installer Type") {
                    Picker("", selection: $viewModel.configuration.installerType) {
                        ForEach(WinTunerInstallerTypeChoice.allCases) { type in
                            Text(type.displayName).tag(type)
                        }
                    }
                    .labelsHidden()
                }
                labeledField("Context") {
                    // Labels match the script's exact `--context` tokens
                    // (`System`/`User`), even though the model's raw cases
                    // are `machine`/`user`.
                    Picker("", selection: $viewModel.configuration.context) {
                        ForEach(WinGetInstallScope.allCases) { scope in
                            Text(scope.scriptValue).tag(scope)
                        }
                    }
                    .labelsHidden()
                }
                labeledField("Locale") {
                    TextField("en-US", text: $viewModel.configuration.locale)
                        .textFieldStyle(.roundedBorder)
                }
                labeledField("Silent Installer Arguments") {
                    TextField("/S /quiet", text: $viewModel.configuration.silentInstallerArguments)
                        .textFieldStyle(.roundedBorder)
                }
                labeledField("Output Directory") {
                    HStack {
                        TextField("~/Desktop/Packages/Windows", text: $viewModel.configuration.outputDirectory)
                            .textFieldStyle(.roundedBorder)
                        Button("Choose…") { chooseOutputDirectory() }
                    }
                }
            }

            Divider().padding(.vertical, 4)

            VStack(alignment: .leading, spacing: 6) {
                Toggle("Download original installer", isOn: $viewModel.configuration.downloadOriginalInstaller)
                Toggle("Create .intunewin package", isOn: $viewModel.configuration.createIntuneWin)
                Toggle("Generate install script", isOn: $viewModel.configuration.generateInstallScript)
                Toggle("Generate uninstall script", isOn: $viewModel.configuration.generateUninstallScript)
                Toggle("Generate detection script", isOn: $viewModel.configuration.generateDetectScript)
                Toggle("Generate requirements script", isOn: $viewModel.configuration.generateRequirementsScript)
                Toggle("Generate packaging report", isOn: $viewModel.configuration.generatePackagingReport)
            }
            .toggleStyle(.checkbox)

            HStack {
                Button("Back") { viewModel.phase = .select }
                    .buttonStyle(.plain)
                    .font(.caption)
                Spacer()
                Button("Continue to Review") { viewModel.proceedToReview() }
                    .disabled(viewModel.resolvedManifest == nil)
            }
            .padding(.top, 8)
        }
    }

    private func labeledField<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            content()
        }
    }

    private func chooseOutputDirectory() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose"
        if panel.runModal() == .OK, let url = panel.url {
            viewModel.configuration.outputDirectory = url.path
        }
    }
}
