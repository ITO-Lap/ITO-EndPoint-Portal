import SwiftUI

struct ManagedSettingsCustomPreferencesTab: View {
    @ObservedObject var viewModel: ManagedSettingsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionCard(title: "Custom Managed Preferences") {
                Text("For advanced administrators: define a vendor-documented preference domain/key directly. macOS or the application may silently ignore keys it doesn't recognize — verify against vendor documentation before deploying.")
                    .font(.caption).foregroundStyle(.orange)

                ForEach($viewModel.customPreferences) { $entry in
                    customEntryRow(entry: $entry)
                }

                Button {
                    viewModel.customPreferences.append(CustomPreferenceEntry())
                } label: {
                    Label("Add Custom Preference", systemImage: "plus.circle")
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private func customEntryRow(entry: Binding<CustomPreferenceEntry>) -> some View {
        let validation = validate(entry.wrappedValue)

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                TextField("Preference domain (e.g. com.vendor.app)", text: entry.domain).textFieldStyle(.roundedBorder)
                TextField("Key", text: entry.key).textFieldStyle(.roundedBorder)
            }
            HStack {
                Picker("Type", selection: entry.type) {
                    ForEach(CustomPreferenceType.allCases) { Text($0.rawValue).tag($0) }
                }
                .frame(width: 160)
                Picker("Scope", selection: entry.scope) {
                    ForEach(CustomPreferenceScope.allCases) { Text($0.rawValue).tag($0) }
                }
                .frame(width: 140)
                Spacer()
                Button(role: .destructive) {
                    viewModel.customPreferences.removeAll { $0.id == entry.wrappedValue.id }
                } label: {
                    Image(systemName: "trash")
                }
                .buttonStyle(.plain)
            }
            TextField(valuePlaceholder(for: entry.wrappedValue.type), text: entry.stringValue)
                .textFieldStyle(.roundedBorder)
            TextField("Documentation reference (URL or doc name)", text: entry.documentationReference)
                .textFieldStyle(.roundedBorder)

            HStack {
                SettingStatusBadge(status: validation.status)
                Text(validation.message).font(.caption2).foregroundStyle(validation.status == .supported ? Color.secondary : Color.red)
            }
        }
        .padding(10)
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(.separator))
    }

    private func valuePlaceholder(for type: CustomPreferenceType) -> String {
        switch type {
        case .string: return "Value"
        case .boolean: return "true or false"
        case .integer: return "Integer value"
        case .array: return "JSON array, e.g. [\"a\", \"b\"]"
        case .dictionary: return "JSON object, e.g. {\"key\": \"value\"}"
        }
    }

    private func validate(_ entry: CustomPreferenceEntry) -> (status: SettingStatus, message: String) {
        guard !entry.domain.isEmpty, !entry.key.isEmpty else {
            return (.unsupported, "Domain and key are required.")
        }
        do {
            _ = try PlistValueParser.parse(entry.stringValue, as: entry.type)
            return entry.documentationReference.isEmpty
                ? (.vendorDocumentationRequired, "Add a documentation reference before exporting.")
                : (.supported, "Value parses correctly as \(entry.type.rawValue).")
        } catch {
            return (.unsupported, error.localizedDescription)
        }
    }
}
