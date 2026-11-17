import AppKit
import Foundation

/// The 8 steps of the Windows packaging wizard, in the fixed order the
/// product brief specifies. `NewWindowsPackageView` renders a step indicator
/// from `CaseIterable` and switches its container on `currentStep`.
enum WindowsPackageWizardStep: Int, CaseIterable, Identifiable {
    case selectApplication
    case selectVersion
    case download
    case validate
    case configure
    case package
    case test
    case export

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .selectApplication: return "Select Application"
        case .selectVersion: return "Select Version"
        case .download: return "Download"
        case .validate: return "Validate"
        case .configure: return "Configure"
        case .package: return "Package"
        case .test: return "Test"
        case .export: return "Export"
        }
    }
}

/// Owns all state for one active Windows packaging job as the administrator
/// walks through the 8-step wizard — selection, download/package job
/// tracking, validation report, configuration draft, and export checklist.
/// One instance per active job, per the plan.
@MainActor
final class WindowsPackageWizardViewModel: ObservableObject {
    @Published var currentStep: WindowsPackageWizardStep = .selectApplication

    // Step 1-2: selection
    @Published var selectedPackage: WinGetPackage?
    @Published var selectedDetail: WinGetPackageDetail?
    @Published var detailPhase: RemoteJobPhase = .idle
    @Published var selectedVersion: String?

    // Step 3: download
    @Published var architecture: WinGetPackageDetail.Architecture = .x64
    @Published var scope: WinGetPackageDetail.InstallerScope = .machine
    @Published var installerType: WinGetPackageDetail.InstallerType = .exe
    @Published var locale: String = "en-US"
    @Published var downloadJob: WindowsBuildJob?
    @Published var downloadPhase: RemoteJobPhase = .idle

    // Step 4: validation
    @Published var validationReport: WindowsValidationReport?
    @Published var validationPhase: RemoteJobPhase = .idle
    @Published var adminOverrideReason: String = ""
    @Published var adminOverrideApprover: String = ""
    @Published var adminOverrideApplied = false

    // Step 5: configuration
    @Published var configuration: WindowsPackageConfiguration = .draft()

    // Step 6: packaging
    @Published var packageJob: WindowsBuildJob?
    @Published var packagePhase: RemoteJobPhase = .idle

    // Step 7: manual test
    @Published var testResult: ManualTestResult?
    @Published var testNotes: String = ""

    // Step 8: export
    @Published var exportPhase: RemoteJobPhase = .idle
    @Published var exportRequestsIntunewin = true

    let client: RemoteBuildAgentServicing

    /// `client` overrides everything (tests/previews). Otherwise resolved
    /// from `connectionStore`: real `WindowsBuildAgentClient` when a Windows
    /// Build Agent is configured, `DemoBuildAgentClient()` otherwise.
    init(connectionStore: WindowsAgentConnectionStore? = nil, client: RemoteBuildAgentServicing? = nil) {
        self.client = client ?? (connectionStore ?? WindowsAgentConnectionStore()).makeClient()
    }

    enum ManualTestResult: String, CaseIterable, Identifiable {
        case pass, fail
        var id: String { rawValue }
        var displayName: String { self == .pass ? "Pass" : "Fail" }
    }

    // MARK: - Step preconditions (gate the Next button)

    func canAdvance(from step: WindowsPackageWizardStep) -> Bool {
        switch step {
        case .selectApplication:
            return selectedPackage != nil
        case .selectVersion:
            return selectedVersion != nil
        case .download:
            return downloadJob != nil && downloadPhase == .completed
        case .validate:
            guard let validationReport else { return false }
            return validationReport.hashMatches || adminOverrideApplied
        case .configure:
            return (try? configuration.validateStrictFields()) != nil
        case .package:
            return packagePhase == .completed
        case .test:
            return testResult != nil
        case .export:
            return true
        }
    }

    func goNext() {
        guard let next = WindowsPackageWizardStep(rawValue: currentStep.rawValue + 1) else { return }
        currentStep = next
    }

    func goBack() {
        guard let previous = WindowsPackageWizardStep(rawValue: currentStep.rawValue - 1) else { return }
        currentStep = previous
    }

    // MARK: - Step 1: Select Application

    func selectPackage(_ package: WinGetPackage) {
        selectedPackage = package
        selectedDetail = nil
        selectedVersion = nil
        detailPhase = .loading
        Task {
            do {
                let detail = try await client.packageDetail(id: package.id)
                selectedDetail = detail
                architecture = detail.architecture
                scope = detail.scope
                installerType = detail.installerType
                locale = detail.locale ?? locale
                detailPhase = .idle
            } catch {
                detailPhase = .error(error.localizedDescription)
            }
        }
    }

    // MARK: - Step 3: Download

    func startDownload() {
        guard let detail = selectedDetail, let version = selectedVersion else { return }
        downloadPhase = .loading
        Task {
            do {
                let job = try await client.submitDownloadJob(
                    packageId: detail.id,
                    version: version,
                    architecture: architecture,
                    scope: scope,
                    locale: locale
                )
                downloadJob = job
                downloadPhase = job.phase
                await pollDownload(job.id)
            } catch {
                downloadPhase = .error(error.localizedDescription)
            }
        }
    }

    private func pollDownload(_ id: UUID) async {
        // Demo agent doesn't track real jobs; treat the initial phase as
        // final. A real client would poll `jobStatus(id:)` here until the
        // phase is terminal.
        guard let job = downloadJob, job.id == id else { return }
        if case .downloading = job.phase {
            downloadPhase = .completed
            seedValidationReport()
        }
    }

    func cancelDownload() {
        guard let job = downloadJob else { return }
        Task {
            try? await client.cancelJob(id: job.id)
            downloadPhase = .cancelled
        }
    }

    // MARK: - Step 4: Validate

    /// Stubs a plausible validation report from the selected detail so the
    /// wizard is demoable end-to-end before the agent-side validation
    /// endpoint exists.
    private func seedValidationReport() {
        guard let detail = selectedDetail else { return }
        validationReport = WindowsValidationReport(
            actualSHA256: detail.sha256 ?? "UNKNOWN",
            expectedSHA256: detail.sha256,
            authenticodeStatus: detail.sha256 != nil ? .validSigned : .unknown,
            publisher: detail.publisher,
            signingCertificateSubject: detail.publisher,
            timestamp: Date(),
            certificateExpiration: Calendar.current.date(byAdding: .year, value: 1, to: Date()),
            installerType: detail.installerType,
            fileVersion: detail.latestVersion,
            productVersion: detail.latestVersion,
            msiProductCode: detail.installerType == .msi ? "{00000000-0000-0000-0000-000000000000}" : nil
        )
        validationPhase = .completed
        seedSuggestedConfiguration()
    }

    func applyAdminOverride() {
        guard !adminOverrideReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !adminOverrideApprover.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        validationReport?.adminOverride = WindowsValidationReport.AdminOverride(
            reason: adminOverrideReason,
            approvedBy: adminOverrideApprover,
            approvedAt: Date()
        )
        adminOverrideApplied = true
    }

    // MARK: - Step 5: Configure

    /// Pre-fills reasonable, administrator-editable starting values based on
    /// installer type — the "AI-suggested values" the brief asks for, stubbed
    /// here rather than a real inference call.
    private func seedSuggestedConfiguration() {
        guard let detail = selectedDetail else { return }
        var config = WindowsPackageConfiguration.draft()
        switch detail.installerType {
        case .msi:
            config.installCommand = "msiexec /i <file>.msi /qn /norestart"
            config.uninstallCommand = "msiexec /x <file>.msi /qn /norestart"
            if let code = validationReport?.msiProductCode {
                config.detectionRules = [.msiProductCode(code)]
            }
        case .exe:
            config.installCommand = "<file>.exe /S"
            config.uninstallCommand = "<uninstaller>.exe /S"
            config.detectionRules = [.fileExists(path: "C:\\Program Files\\\(detail.name)\\\(detail.name).exe")]
        case .msix, .msixBundle:
            config.installCommand = "Add-AppxPackage -Path <file>.msix"
            config.uninstallCommand = "Remove-AppxPackage -Package <packageFullName>"
        case .other:
            config.installCommand = "# Requires administrator review — installer type not recognized"
            config.uninstallCommand = "# Requires administrator review — installer type not recognized"
        }
        config.architecture = architecture
        config.dependencies = detail.dependencies
        configuration = config
    }

    // MARK: - Step 6: Package

    func startPackaging() {
        guard let downloadJob else { return }
        packagePhase = .packaging
        Task {
            do {
                try configuration.validateStrictFields()
                let job = try await client.submitPackageJob(configuration: configuration, sourceJobId: downloadJob.id)
                packageJob = job
                // Demo agent returns `.packaging` immediately; a real client
                // would poll `jobStatus(id:)` until terminal.
                packagePhase = .completed
            } catch {
                packagePhase = .failed(error.localizedDescription)
            }
        }
    }

    // MARK: - Step 8: Export

    /// Result of the last export, so the view can offer "Reveal in Finder".
    @Published var lastExportRoot: URL?

    private let exportService = WindowsPackageExportService()

    /// Assembles the export folder via `WindowsPackageExportService`, from
    /// the administrator-chosen destination, the wizard's collected
    /// `WindowsPackageConfiguration`/`WindowsValidationReport`, and the
    /// installer/`.intunewin` artifacts fetched from the agent for the
    /// completed build job.
    ///
    /// The Download/Package steps are still demo-stubbed (Plan step 9,
    /// "`.intunewin` creation on the agent + artifact download back to Mac",
    /// isn't implemented yet), so `client.fetchArtifact` will fail against
    /// `DemoBuildAgentClient` — that surfaces as a real `.failed` phase with
    /// the underlying reason, rather than a faked `.completed`. Against a
    /// real `WindowsBuildAgentClient` and a real agent, this path fetches
    /// real artifacts and produces a real export.
    ///
    /// - Parameter destinationPicker: returns the folder to export into, or
    ///   `nil` if the user cancelled. Defaults to a real `NSOpenPanel`
    ///   directory picker; overridable for tests.
    func runExport(destinationPicker: @MainActor () -> URL? = WindowsPackageWizardViewModel.pickExportDestination) {
        guard let detail = selectedDetail, let version = selectedVersion else {
            exportPhase = .failed("Select an application and version before exporting.")
            return
        }
        guard let validationReport else {
            exportPhase = .failed("Run validation before exporting.")
            return
        }
        // Prefer the packaging job (carries the .intunewin, when requested)
        // and fall back to the download job so an export can still be
        // attempted for a package built without an .intunewin.
        guard let sourceJob = packageJob ?? downloadJob else {
            exportPhase = .failed("No completed build job to export from.")
            return
        }
        guard let destination = destinationPicker() else {
            return
        }

        exportPhase = .loading
        let requestsIntunewin = exportRequestsIntunewin
        let configuration = configuration
        Task {
            do {
                let installerFileURL = try await client.fetchArtifact(jobId: sourceJob.id, name: "installer")
                var intuneWinFileURL: URL?
                if requestsIntunewin {
                    intuneWinFileURL = try await client.fetchArtifact(jobId: sourceJob.id, name: "package.intunewin")
                }
                let outcome = WindowsPackageJobOutcome(
                    applicationName: detail.name,
                    applicationVersion: version,
                    publisher: detail.publisher,
                    job: sourceJob,
                    intuneWinFileURL: intuneWinFileURL
                )
                let exportRoot = try exportService.export(
                    to: destination,
                    jobOutcome: outcome,
                    configuration: configuration,
                    validationReport: validationReport,
                    includeIntuneWin: requestsIntunewin,
                    installerFileURL: installerFileURL
                )
                lastExportRoot = exportRoot
                exportPhase = .completed
            } catch {
                exportPhase = .failed(error.localizedDescription)
            }
        }
    }

    /// Real destination picker for the app; a directory chosen via
    /// `NSOpenPanel`, mirroring `ConfigurationSection`'s output-directory
    /// picker for the macOS `NewPackage` flow.
    private static func pickExportDestination() -> URL? {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose Export Destination"
        guard panel.runModal() == .OK else { return nil }
        return panel.url
    }
}
