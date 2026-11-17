import SwiftUI

struct SettingStatusBadge: View {
    let status: SettingStatus

    var body: some View {
        Text(status.rawValue)
            .font(.caption2).bold()
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    private var color: Color {
        switch status {
        case .supported: return .green
        case .unsupported: return .red
        case .requiresMDM: return .blue
        case .requiresSupervision: return .purple
        case .userApprovalRequired: return .orange
        case .vendorDocumentationRequired: return .orange
        case .conflict: return .red
        }
    }
}

/// The single reusable "control" presentation every Managed Settings tab
/// uses, so every setting — regardless of tab — shows the same required
/// facts: name, current selection, explanation, payload type, macOS
/// compatibility, required/optional, and validation result.
struct ManagedControlCard<Trailing: View>: View {
    let name: String
    let currentSelection: String
    let explanation: String
    let payloadType: String
    let macOSCompatibility: String
    let isRequired: Bool
    let status: SettingStatus
    @ViewBuilder var trailing: Trailing

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(name).font(.subheadline).bold()
                        Text(isRequired ? "Required" : "Optional")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Text(explanation).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                SettingStatusBadge(status: status)
            }
            HStack {
                Text("Current: \(currentSelection)").font(.caption).bold()
                Spacer()
                trailing
            }
            HStack(spacing: 10) {
                Label(payloadType, systemImage: "shippingbox").font(.caption2).foregroundStyle(.secondary)
                Label(macOSCompatibility, systemImage: "apple.logo").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(.separator))
    }
}

extension ManagedControlCard where Trailing == EmptyView {
    init(name: String, currentSelection: String, explanation: String, payloadType: String, macOSCompatibility: String, isRequired: Bool, status: SettingStatus) {
        self.init(name: name, currentSelection: currentSelection, explanation: explanation, payloadType: payloadType, macOSCompatibility: macOSCompatibility, isRequired: isRequired, status: status, trailing: { EmptyView() })
    }
}

struct AppNotSelectedPlaceholder: View {
    let onChoose: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "app.dashed").font(.system(size: 40)).foregroundStyle(.secondary)
            Text("Select an application to configure Managed Settings")
                .font(.headline)
            Text("Bundle ID, Team ID, and code requirement are extracted from the app's real code signature — nothing here is typed by hand.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)
            Button("Choose Application…", action: onChoose)
                .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, minHeight: 300)
    }
}
