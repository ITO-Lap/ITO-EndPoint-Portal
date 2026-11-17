import SwiftUI

struct WinGetCatalogView: View {
    @StateObject private var viewModel = WinGetCatalogViewModel()
    @State private var showingFilters = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("WinGet Catalog").font(.title2).bold()

            HStack {
                TextField("Search by name or publisher…", text: $viewModel.searchQuery)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: viewModel.searchQuery) { _, _ in viewModel.search() }
                Button {
                    showingFilters.toggle()
                } label: {
                    Label("Filters", systemImage: "line.3.horizontal.decrease.circle")
                }
                .popover(isPresented: $showingFilters) { filtersPopover }
                if !viewModel.searchQuery.isEmpty {
                    Button("Clear", action: viewModel.clearSearch)
                }
            }

            HSplitView {
                resultsList
                    .frame(minWidth: 280)
                detailPane
                    .frame(minWidth: 320)
            }
        }
        .padding(20)
        .onAppear { viewModel.checkAgentReachable() }
    }

    @ViewBuilder
    private var resultsList: some View {
        switch viewModel.phase {
        case .idle where viewModel.results.isEmpty:
            RemoteJobPhaseView(phase: .empty, emptyText: "Search the WinGet catalog to get started.")
        case .disconnected:
            AgentDisconnectedBanner()
        case .loading, .empty, .error:
            RemoteJobPhaseView(phase: viewModel.phase, onRetry: { viewModel.search() })
        default:
            List(viewModel.results, selection: Binding(
                get: { viewModel.selectedDetail.map { "\($0.source):\($0.name)" } },
                set: { _ in }
            )) { package in
                Button {
                    viewModel.selectPackage(package)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(package.name).font(.body).bold()
                        Text("\(package.publisher) · \(package.latestVersion)")
                            .font(.caption).foregroundStyle(.secondary)
                        if let description = package.description {
                            Text(description).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            .listStyle(.inset)
        }
    }

    @ViewBuilder
    private var detailPane: some View {
        switch viewModel.detailPhase {
        case .loading:
            RemoteJobPhaseView(phase: .loading)
        case .error:
            RemoteJobPhaseView(phase: viewModel.detailPhase)
        default:
            if let detail = viewModel.selectedDetail {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionCard(title: detail.name) {
                            VStack(alignment: .leading, spacing: 6) {
                                field("Package ID", detail.id)
                                field("Publisher", detail.publisher)
                                field("Latest Version", detail.latestVersion)
                                if let description = detail.description { field("Description", description) }
                                field("Installer Type", detail.installerType.displayName)
                                field("Architecture", detail.architecture.displayName)
                                field("Scope", detail.scope.displayName)
                                field("Installer URL", detail.installerURL?.absoluteString ?? "—")
                                field("SHA-256", detail.sha256 ?? "Not published")
                                field("Offline Support", detail.supportsOfflineDownload ? "Yes" : "No")
                                field("Dependencies", detail.dependencies.isEmpty ? "None" : detail.dependencies.joined(separator: ", "))
                                field("Available Versions", detail.availableVersions.joined(separator: ", "))
                                if let locale = detail.locale { field("Locale", locale) }
                            }
                        }
                    }
                }
            } else {
                RemoteJobPhaseView(phase: .empty, emptyText: "Select a package to see full manifest details.")
            }
        }
    }

    private func field(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.callout).textSelection(.enabled)
        }
    }

    private var filtersPopover: some View {
        Form {
            TextField("Exact package ID", text: $viewModel.filters.exactId)
            TextField("Publisher", text: $viewModel.filters.publisher)
            TextField("Source", text: $viewModel.filters.source)
            TextField("Version", text: $viewModel.filters.version)
            Picker("Architecture", selection: $viewModel.filters.architecture) {
                Text("Any").tag(WinGetPackageDetail.Architecture?.none)
                ForEach(WinGetPackageDetail.Architecture.allCases) { arch in
                    Text(arch.displayName).tag(WinGetPackageDetail.Architecture?.some(arch))
                }
            }
            Picker("Installer Type", selection: $viewModel.filters.installerType) {
                Text("Any").tag(WinGetPackageDetail.InstallerType?.none)
                ForEach(WinGetPackageDetail.InstallerType.allCases) { type in
                    Text(type.displayName).tag(WinGetPackageDetail.InstallerType?.some(type))
                }
            }
            Picker("Scope", selection: $viewModel.filters.scope) {
                Text("Any").tag(WinGetPackageDetail.InstallerScope?.none)
                ForEach(WinGetPackageDetail.InstallerScope.allCases) { scope in
                    Text(scope.displayName).tag(WinGetPackageDetail.InstallerScope?.some(scope))
                }
            }
            TextField("Locale", text: $viewModel.filters.locale)
            Button("Apply") {
                viewModel.search()
                showingFilters = false
            }
        }
        .padding(16)
        .frame(width: 280)
    }
}
