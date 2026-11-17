import SwiftUI

struct AgentConnectionView: View {
    @StateObject private var connectionStore = WindowsAgentConnectionStore()
    @StateObject private var viewModel: WindowsAgentConnectionViewModel

    @State private var hostText: String = ""
    @State private var portText: String = ""
    @State private var displayNameText: String = ""
    @State private var tokenText: String = ""
    @State private var saveMessage: String?

    init() {
        let store = WindowsAgentConnectionStore()
        _connectionStore = StateObject(wrappedValue: store)
        _viewModel = StateObject(wrappedValue: WindowsAgentConnectionViewModel(connectionStore: store))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Label("Windows Build Agent", systemImage: "bolt.horizontal.circle.fill")
                    .font(.title2).bold()
                Spacer()
                Button("Test Connection") { viewModel.testConnection() }
                    .buttonStyle(.borderedProminent)
            }

            configurationForm

            if let info = viewModel.agentInfo {
                SectionCard(title: "Agent Status") {
                    VStack(alignment: .leading, spacing: 10) {
                        readinessRow(info)
                        Divider()
                        infoRow("Agent Name", info.agentName)
                        infoRow("Windows Version", info.windowsVersion)
                        infoRow("WinGet Version", info.winGetVersion)
                        infoRow("IntuneWinAppUtil", info.intuneWinAppUtilStatus.displayName)
                        infoRow("Last Heartbeat", info.lastHeartbeat.map(Self.formatter.string(from:)) ?? "Never")
                        infoRow("Available Disk Space", info.availableDiskSpaceBytes.map(Self.byteFormatter.string(fromByteCount:)) ?? "Unknown")
                    }
                }
            }

            RemoteJobPhaseView(
                phase: phaseForDisplay,
                emptyText: "No connection attempted yet.",
                onRetry: { viewModel.testConnection() }
            )

            Spacer()
        }
        .padding(20)
        .onAppear {
            hostText = connectionStore.host
            portText = String(connectionStore.port)
            displayNameText = connectionStore.displayName
            if viewModel.agentInfo == nil { viewModel.testConnection() }
        }
    }

    /// Host/port/name (non-secret, stored in `UserDefaults` via
    /// `WindowsAgentConnectionStore`) plus a secure bearer-token field
    /// (Keychain-only, never held in `UserDefaults` or logged). Saving does
    /// not itself attempt a connection — "Save & Test Connection" persists
    /// then immediately calls `testConnection()` so the result is visible
    /// right away.
    private var configurationForm: some View {
        SectionCard(title: "Configure Agent") {
            VStack(alignment: .leading, spacing: 10) {
                LabeledContent("Host") {
                    TextField("agent.internal.AKVERMA.com", text: $hostText)
                        .textFieldStyle(.roundedBorder)
                }
                LabeledContent("Port") {
                    TextField("8443", text: $portText)
                        .textFieldStyle(.roundedBorder)
                        #if os(iOS)
                        .keyboardType(.numberPad)
                        #endif
                }
                LabeledContent("Display Name") {
                    TextField("Optional friendly name", text: $displayNameText)
                        .textFieldStyle(.roundedBorder)
                }
                LabeledContent("Bearer Token") {
                    SecureField("Stored only in Keychain", text: $tokenText)
                        .textFieldStyle(.roundedBorder)
                }

                HStack {
                    Button("Save & Test Connection") { saveAndTest() }
                        .buttonStyle(.bordered)
                        .disabled(hostText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if let saveMessage {
                        Text(saveMessage)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }

                Text("The connection requires HTTPS. A plaintext (http) host/port will be rejected.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func saveAndTest() {
        connectionStore.host = hostText.trimmingCharacters(in: .whitespacesAndNewlines)
        connectionStore.port = Int(portText) ?? connectionStore.port
        connectionStore.displayName = displayNameText.trimmingCharacters(in: .whitespacesAndNewlines)

        guard connectionStore.baseURL != nil else {
            saveMessage = "Invalid host/port — HTTPS connection could not be built."
            return
        }

        if !tokenText.isEmpty {
            do {
                try connectionStore.storeToken(tokenText)
                tokenText = ""
            } catch {
                saveMessage = "Failed to store token in Keychain: \(error.localizedDescription)"
                return
            }
        }

        saveMessage = "Saved."
        viewModel.testConnection()
    }

    /// `.completed`/`.error` already surface via the info card above, so only
    /// show the phase view for states that don't already have dedicated UI.
    private var phaseForDisplay: RemoteJobPhase {
        switch viewModel.connectionPhase {
        case .completed: return .idle
        default: return viewModel.connectionPhase
        }
    }

    private func readinessRow(_ info: WindowsAgentInfo) -> some View {
        Group {
            switch info.readiness {
            case .ready:
                Label("Ready", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
            case .unavailable(let reason):
                Label("Unavailable — \(reason)", systemImage: "xmark.octagon.fill").foregroundStyle(.red)
            }
        }
        .font(.callout).bold()
    }

    private func infoRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value)
        }
        .font(.callout)
    }

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .medium
        return f
    }()

    private static let byteFormatter: ByteCountFormatter = {
        let f = ByteCountFormatter()
        f.countStyle = .file
        return f
    }()
}
