import SwiftUI

struct OptionsSection: View {
    @ObservedObject var viewModel: NewPackageViewModel

    var body: some View {
        SectionCard(title: "5. Options") {
            VStack(alignment: .leading, spacing: 12) {
                optionToggle(
                    "Generate Uninstaller",
                    "Include an uninstall script alongside the package.",
                    isOn: $viewModel.configuration.generateUninstaller
                )
                optionToggle(
                    "Create Detection Script",
                    "Generate a detection script for Endpoint Central.",
                    isOn: $viewModel.configuration.createDetectionScript
                )
                optionToggle(
                    "Sign Package",
                    "Sign the package with a Developer ID Installer certificate.",
                    isOn: $viewModel.configuration.signPackage
                ) { _, newValue in
                    Task { await viewModel.runValidation() }
                }
                if viewModel.configuration.signPackage {
                    Picker("Signing Identity", selection: signingIdentityBinding) {
                        Text("Select an identity…").tag("")
                        ForEach(viewModel.signingIdentities) { identity in
                            Text(identity.commonName).tag(identity.sha1)
                        }
                    }
                    .padding(.leading, 28)
                }
                optionToggle(
                    "Notarize Package",
                    "Submit to Apple notarization and staple the ticket. Requires a keychain profile configured in Settings.",
                    isOn: $viewModel.configuration.notarizePackage
                ) { _, _ in
                    Task { await viewModel.runValidation() }
                }
                optionToggle(
                    "Start Homebrew Service",
                    "Run `brew services start` after installation (formulas only).",
                    isOn: $viewModel.configuration.startHomebrewService
                )
                .disabled(viewModel.configuration.packageKind != .formula || viewModel.selectedPackageInfo?.declaresService == false)
                optionToggle(
                    "Include Detailed Logging",
                    "Write verbose output to the build console and generated logs.",
                    isOn: $viewModel.configuration.detailedLogging
                )
                optionToggle(
                    "Upgrade Existing Installation",
                    "If an older version is already installed, upgrade it instead of failing.",
                    isOn: $viewModel.configuration.upgradeExisting
                )
            }
        }
    }

    private var signingIdentityBinding: Binding<String> {
        Binding(
            get: { viewModel.configuration.signingIdentity ?? "" },
            set: { viewModel.configuration.signingIdentity = $0.isEmpty ? nil : $0 }
        )
    }

    private func optionToggle(
        _ title: String,
        _ help: String,
        isOn: Binding<Bool>,
        onChange: ((Bool, Bool) -> Void)? = nil
    ) -> some View {
        Toggle(isOn: isOn) {
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                Text(help).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .toggleStyle(.switch)
        .help(help)
        .onChange(of: isOn.wrappedValue) { old, new in onChange?(old, new) }
        .accessibilityHint(help)
    }
}
