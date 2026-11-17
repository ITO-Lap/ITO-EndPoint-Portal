import Foundation
import SwiftUI

enum BuildPhase: Equatable {
    case idle
    case validating
    case building
    case succeeded(BuildOutcomeSummary)
    case failed(String)
    case cancelled
}

struct BuildOutcomeSummary: Equatable {
    let packagePath: String
    let isSigned: Bool
    let isNotarized: Bool
}

/// Drives the loading/empty/error/results affordances under the search field.
/// Kept distinct from `selectedPackageInfo` so a completed search can show
/// results while a previously-selected package still fills the summary panel.
enum SearchPhase: Equatable {
    case idle
    case searching
    case results
    case empty
    case error(String)
}

@MainActor
final class NewPackageViewModel: ObservableObject {
    static let minimumSearchLength = 2
    static let searchDebounceNanoseconds: UInt64 = 300_000_000

    @Published var searchQuery: String = ""
    @Published var searchResults: [BrewSearchResult] = []
    @Published var searchPhase: SearchPhase = .idle
    @Published var highlightedResultIndex: Int?
    @Published var selectedPackageInfo: BrewPackageInfo?
    @Published var configuration: PackageConfiguration = .draft()
    @Published var validation = ValidationSummary()
    @Published var isValidating = false
    @Published var buildPhase: BuildPhase = .idle
    @Published var signingIdentities: [SigningIdentity] = []
    @Published var overwriteConfirmationPending = false

    let logService: BuildLogService

    private let homebrewService: HomebrewServicing
    private let validationService: ValidationServicing
    private let packageBuilder: PackageBuilderService
    private let historyService: BuildHistoryServicing
    private let signingService: SigningServicing
    private var searchTask: Task<Void, Never>?
    private var buildTask: Task<Void, Never>?
    private var buildStartedAt: Date?
    /// Incremented on every `search()` call so a slow, superseded search can
    /// never overwrite the results of one started after it — cancellation
    /// alone isn't enough since the underlying process may still be tearing
    /// down when a newer search's result arrives first.
    private var searchGeneration = 0
    /// Set synchronously by `select(_:)`/`applyTemplate(_:)` right before they
    /// programmatically write into `searchQuery`. The field's `onChange` fires
    /// `search()` again as a result — this lets that re-trigger be skipped
    /// without depending on `selectedPackageInfo`, which is only set once the
    /// async `brew info` lookup completes, well after `onChange` already fired.
    private var suppressNextSearch: String?

    init(
        logService: BuildLogService? = nil,
        homebrewService: HomebrewServicing = HomebrewService(),
        validationService: ValidationServicing = ValidationService(),
        packageBuilder: PackageBuilderService = PackageBuilderService(),
        historyService: BuildHistoryServicing = BuildHistoryService(),
        signingService: SigningServicing = SigningService(),
        settings: SettingsStore
    ) {
        self.logService = logService ?? BuildLogService()
        self.homebrewService = homebrewService
        self.validationService = validationService
        self.packageBuilder = packageBuilder
        self.historyService = historyService
        self.signingService = signingService
        self.configuration.outputDirectory = settings.defaultOutputDirectory
        self.configuration.packagingMode = settings.defaultPackagingMode
        self.configuration.minimumMacOSVersion = settings.defaultMinimumMacOSVersion
        self.configuration.packageIdentifier = settings.defaultOrganizationIdentifier + "."
        self.configuration.notarizationKeychainProfile = settings.notarizationKeychainProfile.isEmpty ? nil : settings.notarizationKeychainProfile
    }

    var canBuild: Bool {
        selectedPackageInfo != nil && validation.canBuild && !isBuildRunning
    }

    var isBuildRunning: Bool {
        buildPhase == .building || buildPhase == .validating
    }

    var isSearching: Bool {
        searchPhase == .searching
    }

    func search() {
        searchTask?.cancel()
        searchGeneration += 1
        let generation = searchGeneration

        let trimmed = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= Self.minimumSearchLength else {
            searchPhase = .idle
            searchResults = []
            highlightedResultIndex = nil
            return
        }

        if suppressNextSearch == trimmed {
            suppressNextSearch = nil
            searchPhase = .idle
            searchResults = []
            return
        }
        suppressNextSearch = nil

        searchPhase = .searching
        searchTask = Task { [homebrewService] in
            try? await Task.sleep(nanoseconds: Self.searchDebounceNanoseconds)
            guard !Task.isCancelled else { return }

            do {
                let results = try await homebrewService.search(query: trimmed)
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    // A newer search may have completed first; never let a
                    // slower, stale search overwrite fresher results.
                    guard generation == self.searchGeneration else { return }
                    self.searchResults = results
                    self.searchPhase = results.isEmpty ? .empty : .results
                    self.highlightedResultIndex = results.isEmpty ? nil : 0
                }
            } catch {
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard generation == self.searchGeneration else { return }
                    self.searchResults = []
                    self.highlightedResultIndex = nil
                    self.searchPhase = .error(error.localizedDescription)
                }
            }
        }
    }

    func clearSearch() {
        searchTask?.cancel()
        searchGeneration += 1
        searchQuery = ""
        searchResults = []
        searchPhase = .idle
        highlightedResultIndex = nil
    }

    func moveHighlight(by delta: Int) {
        guard !searchResults.isEmpty else { return }
        let count = searchResults.count
        let current = highlightedResultIndex ?? (delta > 0 ? -1 : 0)
        let next = ((current + delta) % count + count) % count
        highlightedResultIndex = next
    }

    func selectHighlightedResult() {
        guard let index = highlightedResultIndex, searchResults.indices.contains(index) else { return }
        select(searchResults[index])
    }

    func dismissResults() {
        searchTask?.cancel()
        searchGeneration += 1
        searchResults = []
        highlightedResultIndex = nil
        if case .error = searchPhase {
            // keep the error visible on Escape; only results/loading collapse
        } else {
            searchPhase = .idle
        }
    }

    func select(_ result: BrewSearchResult) {
        searchTask?.cancel()
        searchGeneration += 1
        searchResults = []
        highlightedResultIndex = nil
        searchPhase = .idle
        suppressNextSearch = result.token
        searchQuery = result.token
        Task {
            do {
                let info = try await homebrewService.info(token: result.token, kind: result.kind)
                await MainActor.run {
                    self.selectedPackageInfo = info
                    self.configuration.applicationName = info.name
                    self.configuration.homebrewToken = info.token
                    self.configuration.packageKind = info.kind
                    if self.configuration.packageIdentifier.hasSuffix(".") {
                        self.configuration.packageIdentifier += self.sanitizedIdentifierSuffix(info.token)
                    }
                    self.configuration.requiredVersion = "latest"
                    self.configuration.packageVersion = self.sanitizedPackageVersion(info.version)
                    if info.kind == .formula {
                        self.configuration.startHomebrewService = info.declaresService
                    }
                }
                await runValidation()
            } catch {
                await MainActor.run {
                    self.searchPhase = .error(error.localizedDescription)
                }
            }
        }
    }

    private func sanitizedIdentifierSuffix(_ token: String) -> String {
        token.replacingOccurrences(of: "@", with: "-").replacingOccurrences(of: "_", with: "-")
    }

    /// Homebrew version strings aren't guaranteed to satisfy
    /// `Validators.validateVersion` (e.g. some casks report a comma-separated
    /// build number like "121.0.6167,85") — sanitize before it lands in
    /// `packageVersion`, which is validated strictly since it's embedded in
    /// the `.pkg` filename and passed to `pkgbuild --version`. Falls back to
    /// the existing value rather than an empty/placeholder version.
    private func sanitizedPackageVersion(_ rawVersion: String) -> String {
        guard !rawVersion.isEmpty, rawVersion.lowercased() != "unknown" else { return configuration.packageVersion }
        var sanitized = String(rawVersion.map { char -> Character in
            (char.isLetter || char.isNumber || char == "." || char == "_" || char == "+" || char == "-") ? char : "-"
        })
        if let first = sanitized.first, !(first.isLetter || first.isNumber) {
            sanitized = "v" + sanitized
        }
        if sanitized.count > 64 { sanitized = String(sanitized.prefix(64)) }
        return sanitized
    }

    func runValidation() async {
        isValidating = true
        defer { isValidating = false }
        let summary = await validationService.runChecks(for: configuration, packageInfo: selectedPackageInfo)
        signingIdentities = await signingService.availableInstallerIdentities()
        await MainActor.run { self.validation = summary }
    }

    func startBuild() {
        guard let packageInfo = selectedPackageInfo else { return }
        do {
            try configuration.validateStrictFields()
        } catch {
            logService.append("Validation failed: \(error.localizedDescription)")
            buildPhase = .failed(error.localizedDescription)
            return
        }

        let identity = signingIdentities.first { $0.sha1 == configuration.signingIdentity }
        logService.clear()
        buildPhase = .building
        buildStartedAt = Date()
        logService.append("Starting build for \(configuration.applicationName) (\(configuration.homebrewToken))")

        buildTask = Task {
            do {
                let outcome = try await packageBuilder.build(
                    configuration: configuration,
                    packageInfo: packageInfo,
                    signingIdentity: identity,
                    validation: validation,
                    log: { [logService] line in
                        Task { @MainActor in logService.append(line) }
                    },
                    isCancelled: { false }
                )
                await self.handleSuccess(outcome)
            } catch is CancellationError {
                await self.handleCancelled()
            } catch let error as PackageBuilderError {
                if case .cancelled = error {
                    await self.handleCancelled()
                } else {
                    await self.handleFailure(error.localizedDescription)
                }
            } catch {
                await self.handleFailure(error.localizedDescription)
            }
        }
    }

    func cancelBuild() {
        buildTask?.cancel()
        packageBuilder.cancel()
        logService.append("Cancellation requested...")
    }

    @MainActor
    private func handleSuccess(_ outcome: BuildOutcome) {
        buildPhase = .succeeded(BuildOutcomeSummary(packagePath: outcome.packagePath.path, isSigned: outcome.isSigned, isNotarized: outcome.isNotarized))
        saveHistory(result: .success, outputPath: outcome.packagePath.path, isSigned: outcome.isSigned)
    }

    @MainActor
    private func handleFailure(_ message: String) {
        logService.append("FAILED: \(message)")
        buildPhase = .failed(message)
        saveHistory(result: .failed, outputPath: perAppOutputDirectory, isSigned: false)
    }

    @MainActor
    private func handleCancelled() {
        logService.append("Build cancelled.")
        buildPhase = .cancelled
        saveHistory(result: .cancelled, outputPath: perAppOutputDirectory, isSigned: false)
    }

    /// Mirrors `PackageBuilderService.build()`'s per-app subfolder
    /// (`<outputDirectory>/<homebrewToken>`) so a failed/cancelled build's
    /// history entry points at the same place a successful one would have.
    private var perAppOutputDirectory: String {
        guard !configuration.homebrewToken.isEmpty else { return configuration.outputDirectory }
        return (configuration.outputDirectory as NSString).appendingPathComponent(configuration.homebrewToken)
    }

    private func saveHistory(result: BuildResult, outputPath: String, isSigned: Bool) {
        let duration = buildStartedAt.map { Date().timeIntervalSince($0) } ?? 0
        let record = BuildHistoryRecord(
            applicationName: configuration.applicationName,
            version: selectedPackageInfo?.version ?? "unknown",
            buildDate: Date(),
            packagingMode: configuration.packagingMode,
            result: result,
            outputPath: outputPath,
            isSigned: isSigned,
            durationSeconds: duration,
            logPath: nil,
            configuration: configuration
        )
        historyService.save(record)
    }

    func applyTemplate(_ template: PackageTemplate) {
        configuration = template.configuration
        selectedPackageInfo = nil
        searchResults = []
        highlightedResultIndex = nil
        searchPhase = .idle
        suppressNextSearch = configuration.homebrewToken.isEmpty ? nil : configuration.homebrewToken
        searchQuery = configuration.homebrewToken
        if !configuration.homebrewToken.isEmpty {
            Task {
                if let info = try? await homebrewService.info(token: configuration.homebrewToken, kind: configuration.packageKind) {
                    await MainActor.run {
                        self.selectedPackageInfo = info
                        self.configuration.packageVersion = self.sanitizedPackageVersion(info.version)
                    }
                    await runValidation()
                }
            }
        }
    }
}
