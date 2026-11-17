import SwiftUI

struct ManagedSettingsView: View {
    @StateObject private var viewModel = ManagedSettingsViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            if viewModel.appSignature == nil {
                AppNotSelectedPlaceholder(onChoose: viewModel.chooseApplication)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                if let error = viewModel.inspectionError {
                    Text(error).font(.caption).foregroundStyle(.red).padding()
                }
            } else {
                tabBar
                Divider()
                ScrollView {
                    tabContent
                        .padding(20)
                }
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .navigationTitle("Managed Settings")
    }

    private var header: some View {
        HStack(alignment: .top) {
            ScreenHeader(
                title: "Managed Settings",
                subtitle: "Generate PPPC, Notifications, App Update, Extension, Login Item, and Custom Preference profiles from a real application's signature."
            )
            Spacer(minLength: 12)
            if let app = viewModel.appSignature {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(app.appName).font(.headline)
                    Text(app.bundleIdentifier ?? "no bundle ID").font(.caption).foregroundStyle(.secondary)
                }
                Button("Change…", action: viewModel.chooseApplication)
                    .buttonStyle(.bordered)
            }
        }
        .padding(20)
    }

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(ManagedSettingsTab.allCases) { tab in
                    Button {
                        viewModel.selectedTab = tab
                    } label: {
                        Text(tab.rawValue)
                            .font(.subheadline)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(viewModel.selectedTab == tab ? Color.accentColor.opacity(0.15) : .clear)
                            .foregroundStyle(viewModel.selectedTab == tab ? Color.accentColor : .primary)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 8)
        }
    }

    @ViewBuilder
    private var tabContent: some View {
        switch viewModel.selectedTab {
        case .privacy: ManagedSettingsPrivacyTab(viewModel: viewModel)
        case .notifications: ManagedSettingsNotificationsTab(viewModel: viewModel)
        case .appUpdates: ManagedSettingsAppUpdatesTab(viewModel: viewModel)
        case .systemExtensions: ManagedSettingsExtensionsTab(viewModel: viewModel, kind: .system)
        case .networkExtensions: ManagedSettingsExtensionsTab(viewModel: viewModel, kind: .network)
        case .backgroundItems: ManagedSettingsBackgroundItemsTab(viewModel: viewModel)
        case .customPreferences: ManagedSettingsCustomPreferencesTab(viewModel: viewModel)
        case .review: ManagedSettingsReviewExportTab(viewModel: viewModel)
        }
    }
}
