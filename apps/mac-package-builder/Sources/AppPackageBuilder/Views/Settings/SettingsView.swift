import SwiftUI
import AppKit

struct SettingsView: View {
    @EnvironmentObject private var settings: SettingsStore

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScreenHeader(title: "Settings", subtitle: "Preferences & integrations")
                .padding([.horizontal, .top], 24)
                .padding(.bottom, 8)
            settingsForm
        }
        .background(AppTheme.canvas)
        .navigationTitle("Settings")
    }

    private var settingsForm: some View {
        Form {
            Section("Output") {
                HStack {
                    TextField("Default Output Directory", text: $settings.defaultOutputDirectory)
                    Button("Choose…") { chooseDirectory() }
                }
                TextField("Default Organization Identifier", text: $settings.defaultOrganizationIdentifier)
                Picker("Default Packaging Mode", selection: $settings.defaultPackagingModeRaw) {
                    ForEach(PackagingMode.allCases) { mode in
                        Text(mode.displayName).tag(mode.rawValue)
                    }
                }
                TextField("Default Minimum macOS Version", text: $settings.defaultMinimumMacOSVersion)
            }

            Section("Signing & Notarization") {
                TextField("Notarization Keychain Profile", text: $settings.notarizationKeychainProfile)
                    .help("The profile name used with `xcrun notarytool store-credentials`. No secrets are stored by this app.")
            }

            Section("Maintenance") {
                Stepper("Log Retention: \(settings.logRetentionDays) days", value: $settings.logRetentionDays, in: 7...365, step: 7)
                Toggle("Check for Application Updates", isOn: $settings.checkForApplicationUpdates)
            }

            Section("Endpoint Central") {
                TextField("Endpoint Central Server (reference only)", text: $settings.endpointCentralServerHint)
                Text("Direct upload to Endpoint Central is not implemented in this release — packages are uploaded manually via the Endpoint Central console. This field is a reminder for your deployment guide.")
                    .font(.caption).foregroundStyle(.secondary)
            }

            Section("WinGet Packager (Local)") {
                Toggle("Use WinGet.run Discovery (optional)", isOn: $settings.enableWinGetRunDiscovery)
                Text("On by default. Free-text name/publisher searches in the WinGet Packager (Local) module are sent to winget.run, an unofficial third-party discovery index. Switch this off to disable keyword search. Installer URLs and SHA-256 hashes always come from the official microsoft/winget-pkgs manifests.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(maxWidth: 640)
    }

    private func chooseDirectory() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        if panel.runModal() == .OK, let url = panel.url {
            settings.defaultOutputDirectory = url.path
        }
    }
}
