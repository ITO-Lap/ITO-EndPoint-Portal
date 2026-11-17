import SwiftUI

/// The normal Windows workflow: search, choose target, create.  Technical
/// controls remain available but do not interrupt an ordinary package build.
@MainActor
struct WindowsAutoPackageView: View {
    @StateObject private var search: UnifiedWinGetCatalogViewModel
    @StateObject private var service: WindowsAutoPackageService
    @State private var target: WindowsAutoPackageService.DeploymentTarget = .both
    @State private var architecture: WinGetPackageDetail.Architecture = .x64
    @State private var customExportName = ""
    @State private var showAdvanced = false
    @State private var showLog = false

    init() {
        let connectionStore = WindowsAgentConnectionStore()
        let client = connectionStore.makeClient()
        _search = StateObject(wrappedValue: UnifiedWinGetCatalogViewModel(client: client, additionalProviders: [WingetRunDiscoveryProvider(), WinstallDiscoveryProvider()]))
        _service = StateObject(wrappedValue: WindowsAutoPackageService(client: client))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                ScreenHeader(
                    title: "Create Windows Package",
                    subtitle: "Search an application, choose a deployment target, and create a verified package."
                ) {
                    agentStatus
                }
                searchSection
                if let detail = search.selectedDetail { configuration(for: detail) }
                if service.state != .idle { progressSection }
            }
            .padding(24)
        }
        .onAppear { search.checkAgentReachable() }
    }

    private var agentStatus: some View {
        HStack(spacing: 6) {
            Circle().fill(search.phase == .disconnected ? .red : .green).frame(width: 8, height: 8)
            Text(search.phase == .disconnected ? "Windows Agent: Offline" : "Windows Agent: Ready").font(.callout).bold()
        }
        .padding(.horizontal, 10).padding(.vertical, 6).background(.quaternary, in: Capsule())
    }

    private var searchSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("Search Windows applications…", text: $search.searchQuery)
                .textFieldStyle(.roundedBorder)
                .onChange(of: search.searchQuery) { _, _ in search.search() }
            Menu("Sources") {
                ForEach([WinGetSource.microsoftCommunity, .microsoftStore]) { source in
                    Toggle(source.displayName, isOn: Binding(get: { search.enabledSources.contains(source) }, set: { enabled in
                        if enabled { search.enabledSources.insert(source) } else { search.enabledSources.remove(source) }
                        search.search()
                    }))
                }
            }
            if search.phase == .disconnected {
                HStack { Text("A Windows Build Agent is required for WinGet downloads and Windows package creation.").foregroundStyle(.secondary); Button("Configure Agent") { NotificationCenter.default.post(name: .showAgentConnection, object: nil) } }
            } else if search.phase == .loading {
                ProgressView("Searching WinGet…")
            } else if !search.results.isEmpty {
                VStack(spacing: 0) {
                    ForEach(search.results) { result in
                        let package = result.package
                        HStack(spacing: 12) {
                            Image(systemName: "app.fill").frame(width: 26).foregroundStyle(.blue)
                            VStack(alignment: .leading) { Text(package.name).bold(); Text("\(package.publisher) · \(package.latestVersion)").font(.caption).foregroundStyle(.secondary); Text(package.id).font(.caption2).foregroundStyle(.tertiary) }
                            Spacer()
                            Text(result.provider.displayName).font(.caption2).padding(.horizontal, 6).padding(.vertical, 3).background(result.isAuthoritative ? Color.blue.opacity(0.12) : Color.secondary.opacity(0.12), in: Capsule())
                            Button(search.selectedDetail?.id == package.id ? "Selected" : "Select") { search.select(result) }
                                .disabled(search.selectedDetail?.id == package.id)
                        }.padding(10)
                        Divider()
                    }
                }.background(.background, in: RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(.quaternary))
            }
            if !search.partialFailures.isEmpty { Text("Some sources are unavailable; showing available results.").font(.caption).foregroundStyle(.secondary) }
        }
    }

    @ViewBuilder private func configuration(for detail: WinGetPackageDetail) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Divider(); Text("Deployment target").font(.headline)
            Picker("Deployment target", selection: $target) { ForEach(WindowsAutoPackageService.DeploymentTarget.allCases) { Text($0.title).tag($0) } }.pickerStyle(.segmented)
            GroupBox("Automatic summary") {
                Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 8) {
                    summary("Application", detail.name); summary("Version", detail.latestVersion); summary("Architecture", architecture.displayName); summary("Installer", detail.installerType.displayName); summary("Install context", detail.scope.displayName); summary("Target", target.title)
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
            DisclosureGroup("Advanced Options", isExpanded: $showAdvanced) {
                Picker("Architecture", selection: $architecture) { ForEach(WinGetPackageDetail.Architecture.allCases) { Text($0.displayName).tag($0) } }
                TextField("Export filename override", text: $customExportName)
                Text("A custom export name does not change the verified package identity.").font(.caption).foregroundStyle(.secondary)
            }
            Button("Create Package") {
                Task { await service.run(detail: detail, version: detail.latestVersion, target: target, architecture: architecture, customExportName: customExportName) }
            }.buttonStyle(.borderedProminent).disabled(isRunning)
        }
    }

    private var isRunning: Bool { if case .running = service.state { return true }; return false }
    private func summary(_ label: String, _ value: String) -> some View { GridRow { Text(label).foregroundStyle(.secondary); Text(value) } }

    private var progressSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider(); ProgressView(value: service.progress) { Text("Package progress").font(.headline) } currentValueLabel: { Text("\(Int(service.progress * 100))%") }
            if let started = service.startedAt { Text("Elapsed time: \(elapsed(since: started))").font(.caption).foregroundStyle(.secondary) }
            ForEach(WindowsAutoPackageService.Step.allCases) { step in HStack { Image(systemName: icon(for: service.statuses[step] ?? .pending)).foregroundStyle(color(for: service.statuses[step] ?? .pending)); Text(step.rawValue); Spacer(); Text(label(for: service.statuses[step] ?? .pending)).font(.caption).foregroundStyle(.secondary) } }
            switch service.state {
            case .actionRequired(let message): Label(message, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            case .failed(let message):
                HStack(spacing: 10) {
                    Label(message, systemImage: "xmark.octagon.fill").foregroundStyle(.red)
                    if message.localizedCaseInsensitiveContains("agent") {
                        Button("Configure Agent") {
                            NotificationCenter.default.post(name: .showAgentConnection, object: nil)
                        }
                        .buttonStyle(.bordered)
                    }
                }
            case .completed:
                Label("Package Ready", systemImage: "checkmark.seal.fill").font(.headline).foregroundStyle(.green)
                HStack {
                    Button("Download Package") { }
                    Button("Reveal in Finder") { }
                    Button("Open Deployment Guide") { }
                    Button("View Validation Report") { }
                }
                .disabled(true)
                Button("Create Another Package") { service.startNewPackage() }
                Text("Artifacts become available after the Windows agent returns its validated output bundle.").font(.caption).foregroundStyle(.secondary)
            default: EmptyView()
            }
            if isRunning { Button("Cancel") { Task { await service.cancel() } } }
            DisclosureGroup("Technical log", isExpanded: $showLog) { Text(service.logs.joined(separator: "\n")).font(.caption.monospaced()).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
        }
    }
    private func label(for status: WindowsAutoPackageService.StepStatus) -> String { switch status { case .pending: return "Pending"; case .running: return "Running"; case .completed: return "Completed"; case .warning: return "Warning"; case .failed: return "Failed" } }
    private func icon(for status: WindowsAutoPackageService.StepStatus) -> String { switch status { case .pending: return "circle"; case .running: return "arrow.triangle.2.circlepath"; case .completed: return "checkmark.circle.fill"; case .warning: return "exclamationmark.triangle.fill"; case .failed: return "xmark.circle.fill" } }
    private func color(for status: WindowsAutoPackageService.StepStatus) -> Color { switch status { case .pending: return .secondary; case .running: return .blue; case .completed: return .green; case .warning: return .orange; case .failed: return .red } }
    private func elapsed(since date: Date) -> String { let seconds = max(0, Int(Date().timeIntervalSince(date))); return "\(seconds / 60)m \(seconds % 60)s" }
}
