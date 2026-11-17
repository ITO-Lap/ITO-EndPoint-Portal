import SwiftUI

struct RootView: View {
    @State private var selection: SidebarSection = .newPackage
    @State private var pendingTemplate: PackageTemplate?
    @State private var showingAgentConnection = false

    var body: some View {
        NavigationSplitView {
            SidebarView(selection: $selection)
        } detail: {
            detailView
                .navigationSplitViewColumnWidth(min: 700, ideal: 1000)
        }
        // Captured here, not inside `NewPackageView`, because "Use in New
        // Package" is clicked from the Templates tab — `NewPackageView`
        // doesn't exist in the hierarchy yet to receive the notification at
        // that moment. RootView is always mounted, so it can both switch the
        // sidebar selection and hand the template to the freshly created view.
        .onReceive(NotificationCenter.default.publisher(for: .applyTemplate)) { notification in
            guard let template = notification.object as? PackageTemplate else { return }
            pendingTemplate = template
            selection = .newPackage
        }
        // Same cross-view navigation precedent as `.applyTemplate` above, used
        // by `AgentDisconnectedBanner` (posted from any Windows Packaging
        // screen) since there is no sidebar entry dedicated to the connection
        // screen — it is reached as a sheet from wherever the agent is needed.
        .onReceive(NotificationCenter.default.publisher(for: .showAgentConnection)) { _ in
            showingAgentConnection = true
        }
        .sheet(isPresented: $showingAgentConnection) {
            AgentConnectionView()
                .frame(minWidth: 520, minHeight: 480)
        }
    }

    @ViewBuilder
    private var detailView: some View {
        switch selection {
        case .overview: OverviewView()
        // A binding, not a plain value: `NewPackageView` clears it from
        // `.onAppear` (a legitimate lifecycle hook) once applied, rather than
        // this body mutating `@State` inline during view evaluation.
        case .newPackage: NewPackageView(pendingTemplate: $pendingTemplate)
        case .buildHistory: BuildHistoryView()
        case .templates: TemplatesView()
        case .signing: SigningView()
        case .managedSettings: ManagedSettingsView()
        case .settings: SettingsView()
        case .winGetCatalog: WindowsAutoPackageView()
        case .newWindowsPackage: WindowsPackageCatalogView()
        case .windowsBuildJobs: WindowsBuildJobsView()
        case .windowsPackageCatalog: WindowsPackageCatalogView()
        case .winTunerPackager: WinTunerPackagerRootView()
        case .localInstaller: LocalInstallerPackagerView()
        }
    }
}
