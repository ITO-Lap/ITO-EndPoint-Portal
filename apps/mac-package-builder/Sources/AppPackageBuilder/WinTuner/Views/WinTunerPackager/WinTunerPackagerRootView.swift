import SwiftUI

/// Top-level container for the WinGet Packager (Local) module: gates access
/// behind a dependency check, then walks the user through the
/// Search → Select → Configure → Review → Package → Results phases.
struct WinTunerPackagerRootView: View {
    @EnvironmentObject private var settings: SettingsStore
    @StateObject private var dependencyViewModel = WinTunerDependencyViewModel()
    @StateObject private var configurationViewModel = WinTunerConfigurationViewModel()
    @StateObject private var searchViewModel: WinGetLocalSearchViewModel

    @State private var confirmingInstall = false
    @State private var confirmingUpdate = false

    init() {
        // `isOptionalProviderEnabled` is a closure rather than a hard
        // dependency on `SettingsStore` so the search view model stays
        // testable without constructing the real settings store.
        _searchViewModel = StateObject(wrappedValue: WinGetLocalSearchViewModel(isOptionalProviderEnabled: { false }))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            if dependencyViewModel.isChecking && dependencyViewModel.status == .notChecked {
                ProgressView("Checking dependencies…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if !dependencyViewModel.status.ready {
                dependencyGate
            } else {
                phaseIndicator
                phaseContent
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .task {
            await dependencyViewModel.checkOnAppear()
        }
        // `WinGetLocalSearchViewModel` was constructed with a placeholder
        // closure in `init()` since `@EnvironmentObject` isn't readable
        // there; wire up the real one now that `settings` is available.
        .onAppear {
            searchViewModel.isOptionalProviderEnabled = { settings.enableWinGetRunDiscovery }
        }
        .confirmationDialog(
            "Install WinTuner dependencies?",
            isPresented: $confirmingInstall,
            titleVisibility: .visible
        ) {
            Button("Install") { Task { await dependencyViewModel.installDependencies() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This runs Homebrew and PowerShell module installs (pwsh, WinTuner) on this Mac. No Windows host is involved.")
        }
        .confirmationDialog(
            "Update WinTuner?",
            isPresented: $confirmingUpdate,
            titleVisibility: .visible
        ) {
            Button("Update") { Task { await dependencyViewModel.updateWinTuner() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This updates the WinTuner PowerShell module to its latest version.")
        }
    }

    private var header: some View {
        ScreenHeader(
            title: "WinGet Packager (Local)",
            subtitle: "Resolve a WinGet package and build an .intunewin locally via PowerShell + WinTuner — no remote Windows host required."
        ) {
            if dependencyViewModel.status.ready {
                StatusBadge(status: .pass, text: "Dependencies Ready")
            }
        }
    }

    // MARK: - Dependency gate

    private var dependencyGate: some View {
        SectionCard(title: "Dependencies Not Ready") {
            VStack(alignment: .leading, spacing: 10) {
                RequirementRow(check: RequirementCheck(
                    name: "macOS",
                    status: dependencyViewModel.status.macOS ? .pass : .fail,
                    detail: dependencyViewModel.status.macOS ? "Available" : "Not detected"
                ))
                RequirementRow(check: RequirementCheck(
                    name: "Homebrew",
                    status: dependencyViewModel.status.homebrew ? .pass : .fail,
                    detail: dependencyViewModel.status.homebrew ? "Available" : "Not installed"
                ))
                RequirementRow(check: RequirementCheck(
                    name: "PowerShell (pwsh)",
                    status: dependencyViewModel.status.powershell ? .pass : .fail,
                    detail: dependencyViewModel.status.powershell
                        ? "Version \(dependencyViewModel.status.powershellVersion)"
                        : "Not installed"
                ))
                RequirementRow(check: RequirementCheck(
                    name: "WinTuner module",
                    status: dependencyViewModel.status.winTuner ? .pass : .fail,
                    detail: dependencyViewModel.status.winTuner
                        ? "Version \(dependencyViewModel.status.winTunerVersion)"
                        : "Not installed"
                ))

                if let lastError = dependencyViewModel.lastError {
                    Text(lastError).font(.caption).foregroundStyle(.red)
                }

                if dependencyViewModel.isInstalling {
                    ProgressView("Running…").controlSize(.small)
                    ScrollView {
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(Array(dependencyViewModel.installLogLines.enumerated()), id: \.offset) { _, line in
                                Text(line).font(.system(.caption2, design: .monospaced))
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(height: 120)
                    .background(Color.black.opacity(0.85))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }

                HStack {
                    Button("Install Dependencies") { confirmingInstall = true }
                        .disabled(dependencyViewModel.isInstalling || dependencyViewModel.isChecking)
                    Button("Update WinTuner") { confirmingUpdate = true }
                        .disabled(dependencyViewModel.isInstalling || dependencyViewModel.isChecking || !dependencyViewModel.status.homebrew)
                    Button("Check Again") { Task { await dependencyViewModel.checkOnAppear() } }
                        .disabled(dependencyViewModel.isChecking || dependencyViewModel.isInstalling)
                    if dependencyViewModel.isChecking {
                        ProgressView().controlSize(.small)
                    }
                }
            }
        }
    }

    // MARK: - Phase indicator

    private var phaseIndicator: some View {
        let steps: [(String, WinTunerPhase)] = [
            ("Search", .search), ("Select", .select), ("Configure", .configure),
            ("Review", .review), ("Package", .packaging), ("Results", .results),
        ]
        return HStack(spacing: 8) {
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                if index > 0 { phaseSeparator }
                phaseLabel(step.0, phase: step.1)
            }
        }
        .font(.caption)
    }

    private var phaseSeparator: some View {
        Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
    }

    private func phaseLabel(_ text: String, phase target: WinTunerPhase) -> some View {
        let isActive = configurationViewModel.phase == target
        let canNavigate = configurationViewModel.canNavigate(to: target)
        return Button {
            configurationViewModel.navigate(to: target)
        } label: {
            Text(text)
                .bold(isActive)
                .foregroundStyle(isActive ? Color(red: 0.0, green: 0.64, blue: 0.56) : .secondary)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!canNavigate)
        .onHover { inside in
            if canNavigate && inside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
        }
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    @ViewBuilder
    private var phaseContent: some View {
        switch configurationViewModel.phase {
        case .search:
            SearchPhaseView(searchViewModel: searchViewModel, settings: settings) { package in
                configurationViewModel.selectPackage(package)
            }
        case .select:
            SelectPhaseView(viewModel: configurationViewModel)
        case .configure:
            ConfigurePhaseView(viewModel: configurationViewModel)
        case .review:
            ReviewPhaseView(viewModel: configurationViewModel)
        case .packaging:
            PackagePhaseView(viewModel: configurationViewModel)
        case .results:
            ResultsPhaseView(viewModel: configurationViewModel)
        }
    }
}
