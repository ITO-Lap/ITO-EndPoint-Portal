import SwiftUI
import AppKit

struct ManagedSettingsReviewExportTab: View {
    @ObservedObject var viewModel: ManagedSettingsViewModel
    @State private var showRawXML: Set<UUID> = []

    var body: some View {
        let payloads = viewModel.buildAllPayloads()

        VStack(alignment: .leading, spacing: 16) {
            if !viewModel.pppcConflicts.isEmpty {
                SectionCard(title: "Conflicts Detected") {
                    ForEach(viewModel.pppcConflicts, id: \.service) { conflict in
                        Text("\(conflict.service.displayName) has conflicting decisions — macOS may apply the more restrictive setting. Resolve on the Privacy (PPPC) tab before exporting.")
                            .font(.caption).foregroundStyle(.red)
                    }
                }
            }

            SectionCard(title: "Payload Summary") {
                if payloads.isEmpty {
                    Text("No settings configured yet. Visit the other tabs to configure PPPC, Notifications, App Updates, Extensions, Background Items, or Custom Preferences.")
                        .font(.caption).foregroundStyle(.secondary)
                } else {
                    ForEach(payloads) { payload in
                        payloadRow(payload)
                    }
                }
            }

            SectionCard(title: "Export") {
                if let error = viewModel.lastExportError {
                    Text(error).font(.caption).foregroundStyle(.red)
                }
                if let url = viewModel.lastExportedURL {
                    Text("Exported to \(url.path)").font(.caption).foregroundStyle(.green)
                }
                HStack {
                    Button("Export Combined .mobileconfig…") {
                        chooseDirectoryAndExportCombined()
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(payloads.isEmpty || !viewModel.pppcConflicts.isEmpty)

                    Button("Include in Endpoint Central Bundle Output") {
                        includeInBundleOutput()
                    }
                    .buttonStyle(.bordered)
                    .disabled(payloads.isEmpty || !viewModel.pppcConflicts.isEmpty)
                }
                Text("Profiles are written to disk for manual review and deployment — this tool never deploys a profile automatically.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private func payloadRow(_ payload: ManagedSettingsViewModel.GeneratedPayload) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(payload.name).font(.subheadline).bold()
                Spacer()
                switch payload.result {
                case .success: SettingStatusBadge(status: .supported)
                case .failure: SettingStatusBadge(status: .unsupported)
                }
                Button(showRawXML.contains(payload.id) ? "Hide XML" : "Show XML") {
                    if showRawXML.contains(payload.id) { showRawXML.remove(payload.id) }
                    else { showRawXML.insert(payload.id) }
                }
                .buttonStyle(.plain)
                .font(.caption)
                Button("Export…") { exportIndividual(payload) }
                    .buttonStyle(.plain)
                    .font(.caption)
                    .disabled((try? payload.result.get()) == nil)
            }
            switch payload.result {
            case .failure(let error):
                Text(error.localizedDescription).font(.caption).foregroundStyle(.red)
            case .success:
                EmptyView()
            }
            if showRawXML.contains(payload.id), let dict = try? payload.result.get(), let xml = xmlPreview(dict) {
                ScrollView {
                    Text(xml)
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 200)
                .padding(6)
                .background(Color.black.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
        .padding(10)
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(.separator))
    }

    private func xmlPreview(_ dict: [String: Any]) -> String? {
        guard let data = try? viewModel.generator.serializeToXML(dict) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func exportIndividual(_ payload: ManagedSettingsViewModel.GeneratedPayload) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.prompt = "Export Here"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        viewModel.exportIndividualPayload(payload, to: url)
    }

    private func chooseDirectoryAndExportCombined() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.prompt = "Export Here"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        viewModel.exportCombinedProfile(to: url)
    }

    private func includeInBundleOutput() {
        let baseDir = (try? PathValidator.canonicalize("~/Desktop/Packages")) ?? FileManager.default.temporaryDirectory
        let defaultDir = baseDir.appendingPathComponent(viewModel.appFolderName, isDirectory: true)
        try? FileManager.default.createDirectory(at: defaultDir, withIntermediateDirectories: true)
        viewModel.exportCombinedProfile(to: defaultDir)
    }
}
