import SwiftUI

struct ManagedSettingsPrivacyTab: View {
    @ObservedObject var viewModel: ManagedSettingsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionCard(title: "Extracted from Signature") {
                if let app = viewModel.appSignature {
                    VStack(alignment: .leading, spacing: 4) {
                        factRow("Application", app.appName)
                        factRow("Bundle ID", app.bundleIdentifier ?? "unavailable")
                        factRow("Team ID", app.teamIdentifier ?? "unsigned / no team")
                        factRow("Executable Path", app.executablePath ?? "unavailable")
                        factRow("Code Requirement", app.codeRequirement ?? "unavailable")
                        if app.codeRequirement == nil {
                            Text("PPPC generation is blocked until a code requirement can be extracted — this application may be unsigned.")
                                .font(.caption).foregroundStyle(.red)
                        }
                    }
                }
            }

            SectionCard(title: "Presets") {
                HStack {
                    ForEach(PPPCPreset.allCases) { preset in
                        Button(preset.rawValue) { viewModel.applyPPPCPreset(preset) }
                            .buttonStyle(.bordered)
                    }
                }
                Text("Presets fill in decisions below for you to review before export — nothing is exported until you use Review & Export.")
                    .font(.caption).foregroundStyle(.secondary)
            }

            if !viewModel.pppcConflicts.isEmpty {
                SectionCard(title: "Conflicts") {
                    ForEach(viewModel.pppcConflicts, id: \.service) { conflict in
                        Text("\(conflict.service.displayName): conflicting decisions (\(conflict.decisions.map(\.rawValue).joined(separator: ", "))) — macOS may apply the more restrictive setting.")
                            .font(.caption).foregroundStyle(.red)
                    }
                }
            }

            SectionCard(title: "Permissions") {
                VStack(spacing: 8) {
                    ForEach($viewModel.pppcEntries) { $entry in
                        pppcRow(entry: $entry)
                    }
                }
            }
        }
    }

    private func factRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.caption).foregroundStyle(.secondary).frame(width: 130, alignment: .leading)
            Text(value).font(.caption).textSelection(.enabled)
        }
    }

    @ViewBuilder
    private func pppcRow(entry: Binding<PPPCEntry>) -> some View {
        let service = entry.wrappedValue.service
        let hasConflict = viewModel.pppcConflicts.contains { $0.service == service }

        ManagedControlCard(
            name: service.displayName,
            currentSelection: entry.wrappedValue.decision?.rawValue ?? "Not configured",
            explanation: service.explanation,
            payloadType: "com.apple.TCC.configuration-profile-policy",
            macOSCompatibility: "macOS 10.14+",
            isRequired: false,
            status: hasConflict ? .conflict : .requiresMDM,
            trailing: {
                Picker("", selection: entry.decision) {
                    Text("Not configured").tag(PPPCDecision?.none)
                    Text("Allow").tag(PPPCDecision?.some(.allow))
                    Text("Deny").tag(PPPCDecision?.some(.deny))
                }
                .pickerStyle(.segmented)
                .frame(width: 260)
                .labelsHidden()
            }
        )

        if service.requiresTarget, entry.wrappedValue.decision != nil {
            VStack(alignment: .leading, spacing: 4) {
                Text("Apple Events requires a target application:").font(.caption2).foregroundStyle(.secondary)
                TextField("Target bundle identifier", text: entry.targetBundleIdentifier)
                    .textFieldStyle(.roundedBorder)
                TextField("Target code requirement (from codesign -d -r- on the target app)", text: entry.targetCodeRequirement)
                    .textFieldStyle(.roundedBorder)
            }
            .padding(.leading, 12)
        }
    }
}
