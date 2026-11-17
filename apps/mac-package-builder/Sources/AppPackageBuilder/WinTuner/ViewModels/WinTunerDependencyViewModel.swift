import Foundation

/// Drives the "Dependencies not ready" gate at the top of the WinGet
/// Packager (Local) module. Mirrors the read-then-confirm-then-mutate shape
/// used elsewhere in this app: `checkOnAppear()` is a passive read, while
/// `installDependencies()`/`updateWinTuner()` are mutating actions the View
/// must only call after the user has explicitly confirmed via an
/// `.alert`/`.confirmationDialog` — this ViewModel performs no confirmation
/// of its own and has no "already confirmed" bypass.
@MainActor
final class WinTunerDependencyViewModel: ObservableObject {
    @Published var status: DependencyStatus = .notChecked
    @Published var isChecking = false
    @Published var lastError: String?
    @Published var installLogLines: [String] = []
    @Published var isInstalling = false

    private let runner: WinTunerCommandRunning

    init(runner: WinTunerCommandRunning = WinTunerCommandRunner()) {
        self.runner = runner
    }

    func checkOnAppear() async {
        isChecking = true
        lastError = nil
        defer { isChecking = false }
        do {
            status = try await runner.checkDependencies()
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// Runs `install --yes` against the bridge script. The caller (a View)
    /// is expected to have already shown a confirmation dialog before
    /// invoking this — no confirmation happens here.
    func installDependencies() async {
        isInstalling = true
        lastError = nil
        installLogLines.removeAll()
        defer { isInstalling = false }
        do {
            try await runner.installDependencies { [weak self] line in
                Task { @MainActor in self?.installLogLines.append(line) }
            }
            status = try await runner.checkDependencies()
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// Runs `update --yes` against the bridge script. Same confirmation
    /// contract as `installDependencies()`.
    func updateWinTuner() async {
        isInstalling = true
        lastError = nil
        installLogLines.removeAll()
        defer { isInstalling = false }
        do {
            try await runner.updateWinTuner { [weak self] line in
                Task { @MainActor in self?.installLogLines.append(line) }
            }
            status = try await runner.checkDependencies()
        } catch {
            lastError = error.localizedDescription
        }
    }
}
