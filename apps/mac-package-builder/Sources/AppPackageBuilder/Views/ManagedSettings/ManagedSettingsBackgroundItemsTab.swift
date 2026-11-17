import SwiftUI

struct ManagedSettingsBackgroundItemsTab: View {
    @ObservedObject var viewModel: ManagedSettingsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionCard(title: "Detected Background Items") {
                if viewModel.detectedBackgroundItems.isEmpty {
                    Text("No LaunchAgents, LaunchDaemons, login items, or privileged helper tools were found bundled with this application.")
                        .font(.caption).foregroundStyle(.secondary)
                } else {
                    ForEach(viewModel.detectedBackgroundItems) { item in
                        itemRow(item)
                    }
                }
            }

            SectionCard(title: "Managed Login Items Payload") {
                Text("Selected items above will be included as Rules in a com.apple.servicemanagement.managed-login-items payload, approving them without a user prompt.")
                    .font(.caption).foregroundStyle(.secondary)
                Text("Privileged helper tools are never auto-selected — approving a helper's launch is a deliberate decision, not a default.")
                    .font(.caption2).foregroundStyle(.orange)
            }
        }
    }

    private func itemRow(_ item: DetectedBackgroundItem) -> some View {
        let isSelected = viewModel.managedLoginItemSelections.contains(item.id)
        return ManagedControlCard(
            name: item.identifier,
            currentSelection: isSelected ? "Included in Managed Login Items" : "Not included",
            explanation: "\(item.kind.rawValue) at \(item.path)" + (item.isRequiredForOperation ? " — required for the application to function; not auto-disabled." : ""),
            payloadType: "com.apple.servicemanagement.managed-login-items",
            macOSCompatibility: "macOS 13+",
            isRequired: false,
            status: .requiresMDM,
            trailing: {
                Toggle("Include", isOn: Binding(
                    get: { isSelected },
                    set: { include in
                        if include { viewModel.managedLoginItemSelections.insert(item.id) }
                        else { viewModel.managedLoginItemSelections.remove(item.id) }
                    }
                ))
                .toggleStyle(.switch)
            }
        )
    }
}
