import Foundation

enum HomebrewServiceError: LocalizedError {
    case brewNotFound
    case invalidToken(String)
    case decodingFailed(String)
    case notFound(String)
    case networkUnavailable(String)

    var errorDescription: String? {
        switch self {
        case .brewNotFound:
            return "Homebrew was not found at /opt/homebrew/bin/brew or /usr/local/bin/brew."
        case .invalidToken(let t):
            return "\"\(t)\" is not a valid Homebrew token."
        case .decodingFailed(let reason):
            return "Could not parse Homebrew metadata: \(reason)"
        case .notFound(let t):
            return "No formula or cask named \"\(t)\" was found."
        case .networkUnavailable(let reason):
            return "Homebrew isn't installed, and the online Homebrew catalog couldn't be reached (\(reason)). Check your internet connection or install Homebrew."
        }
    }
}

protocol HomebrewServicing {
    func locateBrewExecutable() -> String?
    func search(query: String) async throws -> [BrewSearchResult]
    func info(token: String, kind: PackageKind) async throws -> BrewPackageInfo
    func brewVersion() async throws -> String
}

/// Dedicated Homebrew integration layer. Every `brew` invocation goes through
/// `ProcessRunner` with an argument array — the token is always a distinct
/// argv element, so even a hostile-looking token can never be interpreted as
/// extra flags or shell syntax. Metadata comes from `brew info --json=v2`,
/// decoded with `Codable`, never scraped with `grep`.
///
/// When Homebrew isn't installed, search/info fall back to Homebrew's public
/// JSON API through `HomebrewAPIClient`, so the app needs no Homebrew install.
final class HomebrewService: HomebrewServicing {
    private let processRunner: ProcessRunning
    private let apiClient: HomebrewAPIClient
    private let brewLocator: (() -> String?)?

    /// `brewLocator` is injectable so tests can simulate a Mac without Homebrew.
    init(
        processRunner: ProcessRunning = ProcessRunner(),
        apiClient: HomebrewAPIClient = HomebrewAPIClient(),
        brewLocator: (() -> String?)? = nil
    ) {
        self.processRunner = processRunner
        self.apiClient = apiClient
        self.brewLocator = brewLocator
    }

    func locateBrewExecutable() -> String? {
        if let brewLocator { return brewLocator() }
        for candidate in ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"] {
            if FileManager.default.isExecutableFile(atPath: candidate) {
                return candidate
            }
        }
        return nil
    }

    func brewVersion() async throws -> String {
        guard let brew = locateBrewExecutable() else { return HomebrewAPIClient.displayVersion }
        let output = try await processRunner.run(brew, arguments: ["--version"], currentDirectory: nil, environment: nil, onOutputLine: nil)
        return output.stdout.split(separator: "\n").first.map(String.init) ?? "unknown"
    }

    func search(query: String) async throws -> [BrewSearchResult] {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return [] }
        guard let brew = locateBrewExecutable() else {
            let casks = try await apiClient.searchCasks(query: query)
            return casks + (await apiClient.searchFormulae(query: query))
        }

        async let caskOutput = processRunner.run(brew, arguments: ["search", "--casks", query], currentDirectory: nil, environment: nil, onOutputLine: nil)
        async let formulaOutput = processRunner.run(brew, arguments: ["search", "--formula", query], currentDirectory: nil, environment: nil, onOutputLine: nil)

        let casks = try await caskOutput
        let formulae = try await formulaOutput

        var results: [BrewSearchResult] = []
        results += parseSearchLines(casks.stdout, kind: .cask)
        results += parseSearchLines(formulae.stdout, kind: .formula)
        return results
    }

    private func parseSearchLines(_ output: String, kind: PackageKind) -> [BrewSearchResult] {
        output
            .split(separator: "\n")
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && Validators.isValidToken($0) }
            .map { BrewSearchResult(token: $0, name: $0, kind: kind) }
    }

    func info(token: String, kind: PackageKind) async throws -> BrewPackageInfo {
        guard Validators.isValidToken(token) else { throw HomebrewServiceError.invalidToken(token) }
        guard let brew = locateBrewExecutable() else {
            switch kind {
            case .cask: return Self.makeInfo(cask: try await apiClient.caskInfo(token: token))
            case .formula: return Self.makeInfo(formula: try await apiClient.formulaInfo(token: token))
            }
        }

        let kindFlag = kind == .cask ? "--cask" : "--formula"
        let output = try await processRunner.run(
            brew,
            arguments: ["info", "--json=v2", kindFlag, token],
            currentDirectory: nil,
            environment: nil,
            onOutputLine: nil
        )

        guard let data = output.stdout.data(using: .utf8) else {
            throw HomebrewServiceError.decodingFailed("empty response")
        }

        let decoded: BrewInfoV2Response
        do {
            decoded = try JSONDecoder().decode(BrewInfoV2Response.self, from: data)
        } catch {
            throw HomebrewServiceError.decodingFailed(error.localizedDescription)
        }

        if kind == .cask {
            guard let cask = decoded.casks?.first else { throw HomebrewServiceError.notFound(token) }
            return Self.makeInfo(cask: cask)
        } else {
            guard let formula = decoded.formulae?.first else { throw HomebrewServiceError.notFound(token) }
            return Self.makeInfo(formula: formula)
        }
    }

    static func makeInfo(cask: CaskJSON) -> BrewPackageInfo {
        let armDeps = cask.depends_on?.arch?.contains { entry in
            if case .string(let s) = entry["arm64"] ?? .null { return s.isEmpty == false }
            return entry["arm64"] != nil
        } ?? false
        let intelDeps = cask.depends_on?.arch?.contains { entry in entry["x86_64"] != nil } ?? false
        return BrewPackageInfo(
            token: cask.token,
            name: cask.displayName,
            kind: .cask,
            description: cask.desc,
            homepage: cask.homepage,
            version: cask.version ?? "unknown",
            sourceURL: cask.url,
            sha256: (cask.sha256?.isEmpty == false && cask.sha256 != "no_check") ? cask.sha256 : nil,
            declaresService: false,
            hasArmVariant: armDeps || !intelDeps,
            hasIntelVariant: intelDeps || !armDeps,
            artifactAppNames: cask.appArtifactNames
        )
    }

    static func makeInfo(formula: FormulaJSON) -> BrewPackageInfo {
        BrewPackageInfo(
            token: formula.full_name ?? formula.name,
            name: formula.name,
            kind: .formula,
            description: formula.desc,
            homepage: formula.homepage,
            version: formula.versions?.stable ?? "unknown",
            sourceURL: formula.urls?.stable?.url,
            sha256: formula.urls?.stable?.checksum,
            declaresService: formula.declaresService,
            hasArmVariant: true,
            hasIntelVariant: true,
            artifactAppNames: []
        )
    }
}
