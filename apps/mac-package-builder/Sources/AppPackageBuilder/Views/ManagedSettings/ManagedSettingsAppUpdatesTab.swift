import SwiftUI

struct ManagedSettingsAppUpdatesTab: View {
    @ObservedObject var viewModel: ManagedSettingsViewModel

    private var catalogDefinition: AppUpdateDefinition? {
        guard let bundleID = viewModel.appSignature?.bundleIdentifier else { return nil }
        return AppUpdateCatalog.definition(forBundleIdentifier: bundleID)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionCard(title: "Third-Party Application Updates") {
                if let definition = catalogDefinition {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Verified managed preference found for \(definition.displayName).")
                            .font(.caption).foregroundStyle(.green)
                        Text("Domain: \(definition.preferenceDomain)  ·  Key: \(definition.autoUpdateKey)").font(.caption2).foregroundStyle(.secondary)
                        Text("Source: \(definition.sourceReference)").font(.caption2).foregroundStyle(.secondary)
                        Text("Tested: \(definition.testedVersions)").font(.caption2).foregroundStyle(.secondary)
                    }
                    .padding(.bottom, 4)
                } else {
                    Text("No verified managed auto-update preference is available for this application.")
                        .font(.callout).bold().foregroundStyle(.orange)
                        .padding(.bottom, 4)
                }

                ManagedControlCard(
                    name: "Third-Party Update Policy",
                    currentSelection: viewModel.thirdPartyUpdatePolicy.rawValue,
                    explanation: policyExplanation(for: viewModel.thirdPartyUpdatePolicy, hasCatalogEntry: catalogDefinition != nil),
                    payloadType: catalogDefinition == nil ? "none (no verified preference)" : "com.apple.ManagedClient.preferences",
                    macOSCompatibility: "macOS 10.13+",
                    isRequired: false,
                    status: statusForPolicy(viewModel.thirdPartyUpdatePolicy),
                    trailing: {
                        Picker("", selection: $viewModel.thirdPartyUpdatePolicy) {
                            ForEach(ThirdPartyUpdatePolicy.allCases) { Text($0.rawValue).tag($0) }
                        }
                        .frame(width: 220)
                        .labelsHidden()
                    }
                )
            }

            SectionCard(title: "macOS Software Update") {
                Text("Kept separate from application updates — this generates a com.apple.SoftwareUpdate payload, independent of any third-party vendor mechanism.")
                    .font(.caption).foregroundStyle(.secondary)

                osUpdateToggle("Automatic Check", $viewModel.softwareUpdateSettings.automaticCheckEnabled, "Check for updates automatically.")
                osUpdateToggle("Automatic Download", $viewModel.softwareUpdateSettings.automaticDownload, "Download updates automatically once found.")
                osUpdateToggle("Critical Update Install", $viewModel.softwareUpdateSettings.criticalUpdateInstall, "Install critical security updates automatically.")
                osUpdateToggle("Config Data Install", $viewModel.softwareUpdateSettings.configDataInstall, "Install system configuration data updates automatically.")
                osUpdateToggle("Automatic App Installation", $viewModel.softwareUpdateSettings.automaticAppInstallation, "Install App Store app updates automatically.")
                osUpdateToggle("Automatic OS Installation", $viewModel.softwareUpdateSettings.automaticOSInstallation, "Install macOS version updates automatically.")
                osUpdateToggle("Allow Pre-Release Installation", $viewModel.softwareUpdateSettings.allowPreReleaseInstallation, "Allow installing beta/seed macOS updates.")
            }
        }
    }

    private func osUpdateToggle(_ name: String, _ binding: Binding<Bool>, _ explanation: String) -> some View {
        ManagedControlCard(
            name: name,
            currentSelection: binding.wrappedValue ? "On" : "Off",
            explanation: explanation,
            payloadType: "com.apple.SoftwareUpdate",
            macOSCompatibility: "macOS 10.13+",
            isRequired: false,
            status: .requiresMDM,
            trailing: { Toggle("", isOn: binding).labelsHidden() }
        )
    }

    private func policyExplanation(for policy: ThirdPartyUpdatePolicy, hasCatalogEntry: Bool) -> String {
        switch policy {
        case .managedByVendor: return "No payload generated — the vendor's own updater (e.g. Sparkle, Keystone) is left in its default state."
        case .disableAutoUpdate: return hasCatalogEntry ? "Sets the vendor's documented preference to disable automatic updates." : "No verified preference exists to do this safely — resolves to no payload."
        case .enableAutoUpdate: return hasCatalogEntry ? "Sets the vendor's documented preference to enable automatic updates." : "No verified preference exists to do this safely — resolves to no payload."
        case .managedByMDMPackage: return "No payload generated — updates are expected to arrive via a new package build from this tool instead."
        case .custom: return "Define the exact domain/key/value yourself on the Custom Preferences tab."
        }
    }

    private func statusForPolicy(_ policy: ThirdPartyUpdatePolicy) -> SettingStatus {
        switch policy {
        case .managedByVendor, .managedByMDMPackage: return .supported
        case .disableAutoUpdate, .enableAutoUpdate: return catalogDefinition != nil ? .supported : .vendorDocumentationRequired
        case .custom: return .supported
        }
    }
}
