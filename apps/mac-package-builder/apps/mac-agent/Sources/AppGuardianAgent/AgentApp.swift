import AppGuardianInventory
import AppGuardianAPI
import AppKit
import SwiftUI

@main
struct AppGuardianAgentApp: App {
    @StateObject private var model = AgentViewModel()

    var body: some Scene {
        WindowGroup {
            AgentRootView(model: model)
                .frame(minWidth: 840, minHeight: 580)
                .onOpenURL { url in
                    guard url.scheme == "appguardian", url.host == "open" else { return }
                    NSApp.activate(ignoringOtherApps: true)
                }
        }
        .defaultSize(width: 980, height: 680)
        .windowResizability(.contentMinSize)
    }
}

enum AgentSection: String, CaseIterable, Identifiable {
    case overview = "Overview"
    case applications = "Applications"
    case settings = "Settings"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .overview: "square.grid.2x2"
        case .applications: "app.badge"
        case .settings: "gearshape"
        }
    }
}

@MainActor
final class AgentViewModel: ObservableObject {
    @Published private(set) var scanResult: InventoryScanResult?
    @Published private(set) var isScanning = false
    @Published var statusMessage = "Ready to scan this Mac."
    @Published var errorMessage: String?

    private let scanner = ApplicationScanner()

    func scan() async {
        guard !isScanning else { return }
        isScanning = true
        errorMessage = nil
        statusMessage = "Scanning approved application folders…"
        let scanner = self.scanner
        let result = await Task.detached(priority: .utility) { scanner.scan() }.value
        scanResult = result
        isScanning = false
        statusMessage = "Scanned \(result.applications.count) apps · \(result.issues.count) items need attention"
    }

    func uploadInventory(apiBaseURL: String) async throws {
        guard let scanResult else { throw AgentActionError.scanFirst }
        guard let token = try KeychainTokenStore.read(), !token.isEmpty else {
            throw AppGuardianAPIError.missingAccessToken
        }
        let client = try AppGuardianAPIClient(baseURLString: apiBaseURL)
        let report = AgentInventoryReport(
            serialNumber: DeviceIdentity.serialNumber,
            hostname: DeviceIdentity.hostname,
            currentLoggedInUser: DeviceIdentity.loggedInUser,
            applications: scanResult.applications,
            issues: scanResult.issues
        )
        try await client.uploadInventory(report, bearerToken: token)
    }
}

private enum AgentActionError: LocalizedError {
    case scanFirst

    var errorDescription: String? {
        "Scan this Mac before uploading inventory."
    }
}

private struct AgentRootView: View {
    @ObservedObject var model: AgentViewModel
    @State private var selection: AgentSection? = .overview

    var body: some View {
        NavigationSplitView {
            List(AgentSection.allCases, selection: $selection) { section in
                Label(section.rawValue, systemImage: section.symbol)
                    .tag(section)
            }
            .listStyle(.sidebar)
            .navigationTitle("App Guardian")
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 8) {
                    Circle().fill(model.errorMessage == nil ? Color.green : Color.red).frame(width: 7, height: 7)
                    Text(model.errorMessage == nil ? "Local inventory" : "Action needs attention")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
            }
        } detail: {
            Group {
                switch selection ?? .overview {
                case .overview:
                    OverviewScreen(model: model)
                case .applications:
                    ApplicationsScreen(model: model)
                case .settings:
                    AgentSettingsScreen(model: model)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .task {
            if model.scanResult == nil { await model.scan() }
        }
    }
}

private struct OverviewScreen: View {
    @ObservedObject var model: AgentViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("MAC INVENTORY").font(.caption.weight(.bold)).tracking(1).foregroundStyle(.secondary)
                        Text("This Mac").font(.largeTitle.weight(.bold))
                        Text("Read-only application inventory and verified connection status.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        Task { await model.scan() }
                    } label: {
                        Label(model.isScanning ? "Scanning" : "Scan now", systemImage: "arrow.clockwise")
                    }
                    .disabled(model.isScanning)
                }

                HStack(spacing: 12) {
                    SummaryCard(title: "Applications", value: model.scanResult.map { "\($0.applications.count)" } ?? "—", symbol: "app.badge")
                    SummaryCard(title: "Scan issues", value: model.scanResult.map { "\($0.issues.count)" } ?? "—", symbol: "exclamationmark.triangle")
                    SummaryCard(title: "Device", value: DeviceIdentity.hostname, symbol: "laptopcomputer")
                }

                GroupBox {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Scan status", systemImage: "checkmark.shield")
                            .font(.headline)
                        Text(model.statusMessage).font(.subheadline).foregroundStyle(.secondary)
                        Text("Scans /Applications and the signed-in user’s ~/Applications. No application files are changed.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 4)
                }

                if let error = model.errorMessage {
                    ContentUnavailableView("Action failed", systemImage: "xmark.octagon", description: Text(error))
                }
            }
            .padding(28)
        }
        .navigationTitle("Overview")
    }
}

private struct ApplicationsScreen: View {
    @ObservedObject var model: AgentViewModel
    @State private var searchText = ""

    private var applications: [InstalledApplication] {
        let all = model.scanResult?.applications ?? []
        guard !searchText.isEmpty else { return all }
        return all.filter { "\($0.name) \($0.bundleIdentifier)".localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Applications").font(.title2.weight(.bold))
                    Text("Installed app bundle metadata · read-only")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    Task { await model.scan() }
                } label: {
                    Label("Rescan", systemImage: "arrow.clockwise")
                }
                .disabled(model.isScanning)
            }
            .padding(20)
            Divider()
            if applications.isEmpty {
                ContentUnavailableView(
                    searchText.isEmpty ? "No applications found" : "No matching apps",
                    systemImage: "app.dashed",
                    description: Text(searchText.isEmpty ? "Run a scan or check the accessible Applications folders." : "Try another name or bundle identifier.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(applications) { app in
                    ApplicationRow(application: app)
                }
                .listStyle(.inset)
                .searchable(text: $searchText, prompt: "Search name or bundle ID")
            }
        }
        .navigationTitle("Applications")
    }
}

private struct ApplicationRow: View {
    let application: InstalledApplication

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "app.fill")
                .font(.system(size: 20))
                .foregroundStyle(.blue)
                .frame(width: 34, height: 34)
                .background(.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 7))
            VStack(alignment: .leading, spacing: 3) {
                Text(application.name).font(.subheadline.weight(.semibold))
                Text(application.bundleIdentifier).font(.caption).foregroundStyle(.secondary)
                Text(application.installPath).font(.system(.caption2, design: .monospaced)).foregroundStyle(.tertiary).lineLimit(1)
            }
            Spacer(minLength: 10)
            VStack(alignment: .trailing, spacing: 4) {
                Text(application.shortVersion ?? "Version unknown").font(.caption.weight(.medium))
                Label(signatureTitle, systemImage: signatureSymbol)
                    .font(.caption2)
                    .foregroundStyle(application.codeSignature.status == .valid ? .green : .secondary)
                if let team = application.codeSignature.teamIdentifier {
                    Text(team).font(.system(.caption2, design: .monospaced)).foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
    }

    private var signatureTitle: String {
        switch application.codeSignature.status {
        case .valid: "Signature valid"
        case .invalid: "Signature invalid"
        case .unsigned: "Unsigned"
        case .unavailable: "Signature unavailable"
        }
    }

    private var signatureSymbol: String {
        application.codeSignature.status == .valid ? "checkmark.seal" : "exclamationmark.shield"
    }
}

private struct AgentSettingsScreen: View {
    @ObservedObject var model: AgentViewModel
    @AppStorage("appGuardian.apiBaseURL") private var apiBaseURL = "http://localhost:3000/api/v1"
    @State private var accessToken = ""
    @State private var connectionMessage = "Not tested"
    @State private var isTestingConnection = false
    @State private var isUploading = false
    @State private var settingsError: String?

    var body: some View {
        Form {
            Section("App Guardian API") {
                TextField("API base URL", text: $apiBaseURL, prompt: Text("https://api.example.com/api/v1"))
                    .textContentType(.URL)
                    .autocorrectionDisabled()
                    .accessibilityHint("Use HTTPS. HTTP is allowed only for localhost development.")

                HStack {
                    Button {
                        Task { await testConnection() }
                    } label: {
                        if isTestingConnection { ProgressView().controlSize(.small) }
                        else { Label("Test connection", systemImage: "network") }
                    }
                    .disabled(isTestingConnection || apiBaseURL.isEmpty)
                    Spacer()
                    Text(connectionMessage)
                        .font(.caption)
                        .foregroundStyle(connectionMessage.hasPrefix("Connected") ? .green : .secondary)
                }
            }

            Section("API access token") {
                SecureField("Short-lived bearer token", text: $accessToken)
                    .textContentType(.password)
                    .accessibilityHint("Stored in the macOS Keychain, not in application preferences.")
                HStack {
                    Button("Save to Keychain") { saveToken() }
                        .disabled(accessToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    Button("Remove token", role: .destructive) { removeToken() }
                    Spacer()
                }
                Text("Use a short-lived token issued for this device. Device enrollment and automatic Entra token renewal are not implemented yet.")
                    .font(.caption).foregroundStyle(.secondary)
            }

            Section("Inventory reporting") {
                LabeledContent("Device", value: DeviceIdentity.hostname)
                LabeledContent("Serial number", value: DeviceIdentity.serialNumber)
                LabeledContent("Scan state", value: model.scanResult == nil ? "Scan required" : "Ready to upload")
                Button {
                    Task { await uploadInventory() }
                } label: {
                    if isUploading { ProgressView().controlSize(.small) }
                    else { Label("Upload inventory", systemImage: "arrow.up.doc") }
                }
                .disabled(isUploading || model.scanResult == nil)
            }

            Section("Permissions") {
                Label("Reads /Applications and your ~/Applications folder", systemImage: "checkmark.circle")
                Label("Does not request Full Disk Access", systemImage: "lock.shield")
                Label("No privileged helper or installer in this build", systemImage: "minus.circle")
            }

            if let settingsError {
                Section("Status") {
                    Label(settingsError, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .textSelection(.enabled)
                }
            }
        }
        .formStyle(.grouped)
        .padding(20)
        .frame(maxWidth: 720, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .navigationTitle("Settings")
        .task { loadSavedTokenState() }
    }

    private func testConnection() async {
        isTestingConnection = true
        settingsError = nil
        defer { isTestingConnection = false }
        do {
            let client = try AppGuardianAPIClient(baseURLString: apiBaseURL)
            try await client.checkConnection()
            connectionMessage = "Connected"
        } catch {
            connectionMessage = "Not connected"
            settingsError = error.localizedDescription
        }
    }

    private func saveToken() {
        do {
            try KeychainTokenStore.save(accessToken.trimmingCharacters(in: .whitespacesAndNewlines))
            accessToken = ""
            settingsError = "Access token saved to macOS Keychain."
        } catch {
            settingsError = error.localizedDescription
        }
    }

    private func removeToken() {
        do {
            try KeychainTokenStore.delete()
            accessToken = ""
            settingsError = "Saved access token removed from macOS Keychain."
        } catch {
            settingsError = error.localizedDescription
        }
    }

    private func loadSavedTokenState() {
        do {
            accessToken = try KeychainTokenStore.read() ?? ""
            if !accessToken.isEmpty {
                accessToken = ""
                connectionMessage = "Token saved in Keychain"
            }
        } catch {
            settingsError = error.localizedDescription
        }
    }

    private func uploadInventory() async {
        isUploading = true
        settingsError = nil
        defer { isUploading = false }
        do {
            try await model.uploadInventory(apiBaseURL: apiBaseURL)
            settingsError = "Inventory accepted by App Guardian API."
        } catch {
            settingsError = error.localizedDescription
        }
    }
}

private struct SummaryCard: View {
    let title: String
    let value: String
    let symbol: String

    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 9) {
                Image(systemName: symbol).foregroundStyle(.blue)
                Text(value).font(.title2.weight(.bold)).lineLimit(1).minimumScaleFactor(0.7)
                Text(title).font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 5)
        }
    }
}