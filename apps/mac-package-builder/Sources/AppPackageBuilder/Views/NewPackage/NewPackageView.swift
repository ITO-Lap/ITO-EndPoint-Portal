import SwiftUI

struct NewPackageView: View {
    @EnvironmentObject private var settings: SettingsStore
    @StateObject private var viewModel: NewPackageViewModel
    @State private var showOverwriteAlert = false
    @Binding var pendingTemplate: PackageTemplate?

    init(pendingTemplate: Binding<PackageTemplate?> = .constant(nil)) {
        // `SettingsStore`'s properties are `@AppStorage`, backed by the shared
        // `UserDefaults.standard` — a freshly constructed instance here reads
        // the same persisted values as the one injected into the environment.
        _viewModel = StateObject(wrappedValue: NewPackageViewModel(settings: SettingsStore()))
        _pendingTemplate = pendingTemplate
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                HStack(alignment: .top, spacing: 20) {
                    leftColumn
                        .frame(maxWidth: .infinity)
                    rightColumn
                        .frame(width: 380)
                }
            }
            .padding(24)
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .task { await viewModel.runValidation() }
        .onAppear {
            guard let template = pendingTemplate else { return }
            viewModel.applyTemplate(template)
            pendingTemplate = nil
        }
        .alert("Build failed", isPresented: isFailedBinding) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(failureMessage)
        }
    }

    private var header: some View {
        ScreenHeader(
            title: "Create macOS Package",
            subtitle: "Search for an application and configure packaging options for Endpoint Central."
        )
    }

    private var leftColumn: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .top, spacing: 20) {
                SelectApplicationSection(viewModel: viewModel)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                PackageTypeSection(viewModel: viewModel)
                    .frame(width: 280, alignment: .topLeading)
            }
            PackagingModeSection(viewModel: viewModel)
            ConfigurationSection(viewModel: viewModel)
            OptionsSection(viewModel: viewModel)
        }
    }

    private var rightColumn: some View {
        VStack(alignment: .leading, spacing: 20) {
            PackageSummarySection(viewModel: viewModel)
            RequirementsSection(viewModel: viewModel)
            BuildConsoleView(logService: viewModel.logService)
            MainActionsBar(viewModel: viewModel)
        }
    }

    private var isFailedBinding: Binding<Bool> {
        Binding(
            get: {
                if case .failed = viewModel.buildPhase { return true }
                return false
            },
            set: { newValue in
                if !newValue { viewModel.buildPhase = .idle }
            }
        )
    }

    private var failureMessage: String {
        if case .failed(let message) = viewModel.buildPhase { return message }
        return ""
    }
}
