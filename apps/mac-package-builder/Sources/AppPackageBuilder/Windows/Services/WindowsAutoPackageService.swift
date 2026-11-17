import Foundation

/// The one Mac-side orchestration point for the permitted Windows packaging
/// operations.  It never runs PowerShell/WinGet locally and never sends a
/// shell command to the agent: requests remain constrained to the typed
/// download and package endpoints.
@MainActor
final class WindowsAutoPackageService: ObservableObject {
    enum DeploymentTarget: String, CaseIterable, Identifiable, Codable {
        case endpointCentral, intune, both
        var id: String { rawValue }
        var title: String {
            switch self { case .endpointCentral: return "Endpoint Central"; case .intune: return "Microsoft Intune"; case .both: return "Both" }
        }
    }

    enum Step: String, CaseIterable, Identifiable {
        case preparing = "Preparing application"
        case downloading = "Downloading installer"
        case hash = "Verifying SHA-256"
        case signature = "Checking publisher signature"
        case install = "Generating install command"
        case uninstall = "Generating uninstall command"
        case detection = "Creating detection rule"
        case endpoint = "Building Endpoint Central package"
        case intune = "Building IntuneWin package"
        case validating = "Validating output"
        var id: String { rawValue }
    }

    enum StepStatus: Equatable { case pending, running, completed, warning, failed }
    enum State: Equatable { case idle, running, actionRequired(String), failed(String), completed }

    @Published private(set) var state: State = .idle
    @Published private(set) var statuses: [Step: StepStatus] = Dictionary(uniqueKeysWithValues: Step.allCases.map { ($0, .pending) })
    @Published private(set) var logs: [String] = []
    @Published private(set) var startedAt: Date?
    @Published private(set) var completedJob: WindowsBuildJob?
    @Published private(set) var validationReport: WindowsValidationReport?

    private let client: RemoteBuildAgentServicing
    private let jobs: WindowsPackageJobService
    private var activeJobID: UUID?

    init(client: RemoteBuildAgentServicing, pollInterval: TimeInterval = 1) {
        self.client = client
        self.jobs = WindowsPackageJobService(client: client, pollInterval: pollInterval)
    }

    var progress: Double {
        Double(statuses.values.filter { $0 == .completed || $0 == .warning }.count) / Double(Step.allCases.count)
    }

    func run(detail: WinGetPackageDetail, version: String, target: DeploymentTarget, architecture: WinGetPackageDetail.Architecture, customExportName: String? = nil) async {
        reset()
        startedAt = Date(); state = .running
        do {
            set(.preparing, .running)
            let info = try await client.health()
            guard case .ready = info.readiness else { throw AutoError.agentOffline }
            guard WinGetValidators.isValidVersion(version) else { throw WindowsPackageNamingService.NamingError.missingVersion }
            guard detail.installerType != .other else { throw AutoError.unsupportedInstaller }
            _ = try WindowsPackageNamingService().fileName(application: detail.name, version: version, architecture: architecture, ext: detail.installerType.rawValue, customName: customExportName)
            set(.preparing, .completed)

            set(.downloading, .running)
            let download = try await jobs.download(packageId: detail.id, version: version, architecture: architecture, scope: detail.scope, locale: detail.locale, source: detail.source, log: { [weak self] line in
                Task { @MainActor [weak self] in self?.appendLog(line) }
            }, isCancelled: { Task.isCancelled })
            activeJobID = download.id
            set(.downloading, .completed)

            guard let report = download.validationReport else { throw AutoError.missingValidation }
            validationReport = report
            set(.hash, report.hashMatches ? .completed : .failed)
            guard report.hashMatches else { throw AutoError.hashMismatch }
            set(.signature, report.authenticodeStatus == .validSigned ? .completed : .failed)
            guard report.authenticodeStatus == .validSigned else {
                state = .actionRequired("The installer signature was not valid. Review the signed publisher and explicitly approve a replacement package.")
                return
            }
            guard report.publisher?.localizedCaseInsensitiveContains(detail.publisher) == true else { throw AutoError.publisherMismatch }

            let configuration = try configuration(for: detail, report: report, architecture: architecture, target: target)
            set(.install, .completed); set(.uninstall, .completed); set(.detection, .completed)
            if target == .endpointCentral || target == .both { set(.endpoint, .running) }
            if target == .intune || target == .both { set(.intune, .running) }
            let packaged = try await jobs.package(configuration: configuration, sourceJobId: download.id, log: { [weak self] line in
                Task { @MainActor [weak self] in self?.appendLog(line) }
            }, isCancelled: { Task.isCancelled })
            activeJobID = packaged.id; completedJob = packaged
            if target == .endpointCentral || target == .both { set(.endpoint, .completed) }
            if target == .intune || target == .both { set(.intune, .completed) }
            set(.validating, .running)
            set(.validating, .completed)
            state = .completed
            _ = configuration // retains a typed, validated agent request above.
        } catch AutoError.actionRequired(let message) {
            state = .actionRequired(message)
            if let step = Step.allCases.first(where: { statuses[$0] == .running }) { statuses[step] = .warning }
            appendLog(message)
        } catch is CancellationError {
            state = .failed("Package creation was cancelled.")
        } catch {
            fail(error.localizedDescription)
        }
    }

    func cancel() async {
        guard let activeJobID else { return }
        try? await client.cancelJob(id: activeJobID)
        appendLog("Cancellation requested.")
        state = .failed("Package creation was cancelled.")
    }

    func startNewPackage() {
        reset()
        startedAt = nil
        state = .idle
    }

    private func configuration(for detail: WinGetPackageDetail, report: WindowsValidationReport, architecture: WinGetPackageDetail.Architecture, target: DeploymentTarget) throws -> WindowsPackageConfiguration {
        var config = WindowsPackageConfiguration.draft()
        config.architecture = architecture
        config.dependencies = detail.dependencies
        config.deploymentTargets = target == .both ? [DeploymentTarget.endpointCentral.rawValue, DeploymentTarget.intune.rawValue] : [target.rawValue]
        switch detail.installerType {
        case .msi:
            guard let productCode = report.msiProductCode else { throw AutoError.actionRequired("MSI product code could not be determined safely.") }
            guard let originalName = detail.installerURL?.lastPathComponent,
                  !originalName.isEmpty, !originalName.contains(".."), !originalName.contains("/") && !originalName.contains("\\")
            else { throw AutoError.actionRequired("The validated MSI filename could not be determined safely.") }
            config.installCommand = "msiexec.exe /i \"$PSScriptRoot\\Installer\\\(originalName)\" /qn /norestart"
            config.uninstallCommand = "msiexec.exe /x \(productCode) /qn /norestart"
            config.detectionRules = [.msiProductCode(productCode)]
        case .exe, .msix, .msixBundle:
            // The current agent contract deliberately does not expose manifest
            // switches. Do not invent them; stop in the single review state.
            throw AutoError.actionRequired("Verified silent install and uninstall switches are required for this installer.")
        case .other: throw AutoError.unsupportedInstaller
        }
        return config
    }

    private func reset() { statuses = Dictionary(uniqueKeysWithValues: Step.allCases.map { ($0, .pending) }); logs = []; validationReport = nil; completedJob = nil; activeJobID = nil }
    private func set(_ step: Step, _ status: StepStatus) { statuses[step] = status; appendLog("\(step.rawValue): \(String(describing: status))") }
    private func appendLog(_ line: String) { logs.append(line) }
    private func fail(_ message: String) { if let step = Step.allCases.first(where: { statuses[$0] == .running }) { statuses[step] = .failed }; state = .failed(message); appendLog(message) }

    enum AutoError: LocalizedError { case agentOffline, unsupportedInstaller, missingValidation, hashMismatch, publisherMismatch, actionRequired(String)
        var errorDescription: String? { switch self { case .agentOffline: return "Windows Build Agent is offline. Configure Agent in Settings."; case .unsupportedInstaller: return "This installer type is not supported for automatic packaging."; case .missingValidation: return "The Windows agent did not return a validation report; packaging was blocked."; case .hashMismatch: return "Installer SHA-256 does not match the WinGet manifest."; case .publisherMismatch: return "The Authenticode publisher does not match the WinGet publisher."; case .actionRequired(let message): return message } }
}
}
