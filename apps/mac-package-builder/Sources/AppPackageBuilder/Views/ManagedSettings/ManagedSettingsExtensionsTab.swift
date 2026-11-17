import SwiftUI

enum ExtensionTabKind {
    case system
    case network

    var title: String {
        switch self {
        case .system: return "System Extensions"
        case .network: return "Network Extensions"
        }
    }
}

/// Both tabs generate the same real payload type
/// (`com.apple.system-extension-policy`) since network extension providers
/// (filters, DNS proxies, VPN, app proxies) *are* system extensions on
/// modern macOS — presented separately here for clarity, filtered by kind.
struct ManagedSettingsExtensionsTab: View {
    @ObservedObject var viewModel: ManagedSettingsViewModel
    let kind: ExtensionTabKind

    private var relevantExtensions: [DetectedSystemExtension] {
        viewModel.detectedSystemExtensions.filter { ext in
            switch kind {
            case .system: return ext.pointKind != .networkExtension
            case .network: return ext.pointKind == .networkExtension
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionCard(title: "Detected Extensions") {
                if relevantExtensions.isEmpty {
                    Text("No \(kind.title.lowercased()) were detected in this application bundle's Contents/Library/SystemExtensions.")
                        .font(.caption).foregroundStyle(.secondary)
                } else {
                    ForEach(relevantExtensions) { ext in
                        extensionRow(ext)
                    }
                }
            }

            if kind == .system {
                SectionCard(title: "Options") {
                    Toggle("Allow user overrides in System Settings", isOn: $viewModel.allowUserOverridesForExtensions)
                        .font(.caption)
                    Text("com.apple.system-extension-policy's AllowUserOverrides key — when off, users cannot approve/deny extensions from this Team ID themselves.")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func extensionRow(_ ext: DetectedSystemExtension) -> some View {
        let isApproved = viewModel.systemExtensionApprovals[ext.identifier] == .allow
        let explanation: String
        if kind == .network, let providerKind = ext.networkProviderKind {
            explanation = "Detected provider type: \(providerKind.rawValue)."
        } else {
            explanation = "Extension point: \(ext.pointKind.displayName)."
        }

        return ManagedControlCard(
            name: ext.identifier,
            currentSelection: isApproved ? "Allow" : "Not Configured",
            explanation: explanation + " Team ID: \(ext.teamIdentifier ?? "unavailable").",
            payloadType: "com.apple.system-extension-policy",
            macOSCompatibility: "macOS 11+",
            isRequired: false,
            status: ext.teamIdentifier == nil ? .unsupported : .requiresMDM,
            trailing: {
                Toggle("Allow", isOn: Binding(
                    get: { isApproved },
                    set: { viewModel.systemExtensionApprovals[ext.identifier] = $0 ? .allow : .notConfigured }
                ))
                .toggleStyle(.switch)
                .disabled(ext.teamIdentifier == nil)
            }
        )
    }
}
