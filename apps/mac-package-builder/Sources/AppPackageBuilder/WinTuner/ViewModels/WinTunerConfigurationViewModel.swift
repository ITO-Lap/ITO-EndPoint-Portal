import Foundation

/// The six phases of one WinGet Packager (Local) run, per the approved plan:
/// Search → Select (version/variant) → Configure → Review → Package → Results.
enum WinTunerPhase: Equatable {
    case search
    case select
    case configure
    case review
    case packaging
    case results
}

/// Owns the phase machine and all state for a single WinGet Packager (Local)
/// run, from a selected search result through to a packaging result.
/// Packaging is only ever started from `beginPackaging(log:)`, which the View
/// must gate behind an explicit user action (a "Package" button on the
/// Review screen) — nothing here auto-advances into packaging.
@MainActor
final class WinTunerConfigurationViewModel: ObservableObject {
    @Published var phase: WinTunerPhase = .search
    @Published var selectedPackage: WinGetManifestPackage?
    @Published var availableVersions: [String] = []
    @Published var selectedVersion: String?
    @Published var resolvedManifest: WinGetInstallerManifest?
    @Published var configuration: WinTunerPackageConfiguration = .draft(packageId: "")
    @Published var packageResult: WinTunerPackageResult?
    @Published var liveLogLines: [String] = []
    @Published var runError: String?
    @Published var isRunning = false
    @Published var isLoadingVersions = false
    @Published var isResolvingManifest = false
    @Published var loadVersionsError: String?
    @Published var resolveManifestError: String?
    @Published var installerBytes: Int64?
    @Published var acknowledgedUnverifiedCommand = false

    private let manifestService: WinGetManifestService
    private let commandRunner: WinTunerCommandRunning
    private var packagingTask: Task<Void, Never>?
    private var isCancelRequested = false
    /// The last silent-arguments value this view model filled in itself, so a
    /// re-resolve (new version/architecture) can refresh it without
    /// overwriting anything the user typed.
    private var autoFilledSilentArguments = ""

    init(
        manifestService: WinGetManifestService = .init(),
        commandRunner: WinTunerCommandRunning = WinTunerCommandRunner()
    ) {
        self.manifestService = manifestService
        self.commandRunner = commandRunner
    }

    /// Moves from Search to Select once the user has chosen a search result.
    func selectPackage(_ package: WinGetManifestPackage) {
        selectedPackage = package
        availableVersions = []
        selectedVersion = nil
        resolvedManifest = nil
        configuration = .draft(packageId: package.id)
        configuration.version = package.latestVersion
        phase = .select
        Task { await loadVersions() }
    }

    func loadVersions() async {
        guard let selectedPackage else { return }
        isLoadingVersions = true
        loadVersionsError = nil
        defer { isLoadingVersions = false }
        do {
            let versions = try await manifestService.availableVersions(for: selectedPackage.id)
            availableVersions = versions
        } catch {
            loadVersionsError = error.localizedDescription
        }
    }

    /// Resolves the installer manifest for `version` and advances to
    /// Configure on success. Never starts a download or packaging run —
    /// that only ever happens from `beginPackaging(log:)`.
    func resolveManifest(version: String) async {
        guard let selectedPackage else { return }
        selectedVersion = version
        isResolvingManifest = true
        resolveManifestError = nil
        defer { isResolvingManifest = false }
        do {
            let manifest = try await manifestService.fetchInstallerManifest(
                packageId: selectedPackage.id,
                version: version,
                architecture: configuration.architecture,
                installerType: configuration.installerType.explicitType
            )
            resolvedManifest = manifest
            configuration.version = manifest.version
            prefillSilentArguments(from: manifest)
            phase = .configure
        } catch {
            resolveManifestError = error.localizedDescription
        }
    }

    /// Pre-populates "Silent Installer Arguments" from the manifest's
    /// `InstallerSwitches` (Silent, else SilentWithProgress). Leaves the field
    /// alone if the user has edited it.
    private func prefillSilentArguments(from manifest: WinGetInstallerManifest) {
        let current = configuration.silentInstallerArguments
        guard current.isEmpty || current == autoFilledSilentArguments else { return }
        let value = manifest.silentInstallSwitches?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        configuration.silentInstallerArguments = value
        autoFilledSilentArguments = value
    }

    var preflight: WinTunerPreflight? {
        guard let manifest = resolvedManifest else { return nil }
        return .evaluate(manifest: manifest, configuration: configuration, installerBytes: installerBytes)
    }

    /// Whether packaging may start: no blocking check, and any unconfirmed
    /// EXE command has been explicitly acknowledged.
    var canBeginPackaging: Bool {
        guard let preflight, !isRunning else { return false }
        return !preflight.hasBlocking && (!preflight.needsAcknowledgement || acknowledgedUnverifiedCommand)
    }

    /// Reads the installer size with a HEAD request (no download).
    func loadInstallerSize() async {
        installerBytes = nil
        guard let url = resolvedManifest?.installerURL else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        request.timeoutInterval = 15
        if let (_, response) = try? await URLSession.shared.data(for: request),
           response.expectedContentLength > 0 {
            installerBytes = response.expectedContentLength
        }
    }

    /// Advances from Configure to Review. A plain phase transition — no
    /// network or process work happens here.
    func proceedToReview() {
        guard resolvedManifest != nil else { return }
        acknowledgedUnverifiedCommand = false
        phase = .review
        Task { await loadInstallerSize() }
    }

    /// Starts the actual packaging run. Must only ever be invoked from an
    /// explicit "Package" button press on the Review screen — never
    /// automatically from `resolveManifest(version:)` or
    /// `proceedToReview()`.
    func beginPackaging(log: @escaping @Sendable (String) -> Void = { _ in }) async {
        guard let manifest = resolvedManifest else { return }
        do {
            try configuration.validateStrictFields()
        } catch {
            runError = error.localizedDescription
            return
        }

        isCancelRequested = false
        isRunning = true
        runError = nil
        liveLogLines.removeAll()
        phase = .packaging

        packagingTask = Task { [weak self, commandRunner, configuration, manifest] in
            guard let self else { return }
            do {
                let result = try await commandRunner.package(
                    configuration: configuration,
                    manifest: manifest,
                    log: { [weak self] line in
                        Task { @MainActor in
                            self?.liveLogLines.append(line)
                            log(line)
                        }
                    },
                    isCancelled: { [weak self] in
                        self?.isCancelRequested ?? false
                    }
                )
                await MainActor.run {
                    self.isRunning = false
                    self.packageResult = result
                    self.phase = .results
                }
            } catch is CancellationError {
                await MainActor.run {
                    self.isRunning = false
                    self.runError = "Packaging was cancelled."
                    // Stay on the packaging phase (not results) so the
                    // failure is visible and retryable — never fabricate a
                    // success transition.
                }
            } catch {
                await MainActor.run {
                    self.isRunning = false
                    self.runError = error.localizedDescription
                    // Stay put; do not silently move to `.results` with a
                    // fake success.
                }
            }
        }
    }

    func cancelPackaging() {
        isCancelRequested = true
        packagingTask?.cancel()
    }

    /// Whether the phase indicator may jump to `target`. Navigation is limited
    /// to steps whose prerequisites already exist, is disabled while a
    /// packaging run is active, and never enters `.packaging` — packaging
    /// only starts from the explicit Package button via `beginPackaging`.
    func canNavigate(to target: WinTunerPhase) -> Bool {
        guard !isRunning, !isResolvingManifest, target != phase else { return false }
        switch target {
        case .search: return true
        case .select: return selectedPackage != nil
        case .configure, .review: return resolvedManifest != nil
        case .packaging: return false
        case .results: return packageResult != nil
        }
    }

    /// Jumps to `target` without discarding any state, so the user can move
    /// back and forth through the steps they have already completed.
    func navigate(to target: WinTunerPhase) {
        guard canNavigate(to: target) else { return }
        phase = target
    }

    /// Re-attempts whatever step failed for the current phase, without
    /// discarding unrelated state (e.g. retrying manifest resolution keeps
    /// the selected package and version list intact).
    func retryCurrentPhase() {
        switch phase {
        case .search:
            break
        case .select:
            Task { await loadVersions() }
        case .configure:
            if let selectedVersion {
                Task { await resolveManifest(version: selectedVersion) }
            }
        case .review:
            break
        case .packaging:
            Task { await beginPackaging() }
        case .results:
            break
        }
    }

    /// Resets the whole flow back to Search, e.g. for "Package Another
    /// Application".
    func reset() {
        packagingTask?.cancel()
        phase = .search
        selectedPackage = nil
        availableVersions = []
        selectedVersion = nil
        resolvedManifest = nil
        configuration = .draft(packageId: "")
        packageResult = nil
        liveLogLines = []
        runError = nil
        isRunning = false
        loadVersionsError = nil
        resolveManifestError = nil
    }
}
