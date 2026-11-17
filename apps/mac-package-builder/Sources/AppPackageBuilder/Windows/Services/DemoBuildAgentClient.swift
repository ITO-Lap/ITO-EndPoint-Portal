import Foundation

/// In-app, in-memory stand-in for a real Windows Build Agent connection.
///
/// `MockBuildAgentClient` (Tests/AppPackageBuilderTests/Mocks) exists only in
/// the test target — it isn't linked into the shipped app — so every Windows
/// Packaging ViewModel needs its own default here to be demoable standalone
/// before `WindowsBuildAgentClient` (a real `URLSession` implementation) is
/// built. Same protocol, same shape as the test mock, just with a handful of
/// plausible canned WinGet packages instead of settable per-test results.
///
/// TODO: replace with real `WindowsBuildAgentClient` once implemented (Plan
/// step 5) — every ViewModel that depends on `RemoteBuildAgentServicing`
/// should only need its default argument swapped, no call-site changes.
final class DemoBuildAgentClient: RemoteBuildAgentServicing {
    private let samplePackages: [WinGetPackageDetail] = [
        WinGetPackageDetail(
            name: "Visual Studio Code",
            publisher: "Microsoft Corporation",
            latestVersion: "1.94.2",
            description: "Free source-code editor made by Microsoft.",
            source: "winget",
            installerType: .exe,
            architecture: .x64,
            scope: .machine,
            installerURL: URL(string: "https://update.code.visualstudio.com/1.94.2/win32-x64/stable"),
            sha256: "3B1F1B6F0B2D9C0B3A5E1B0C8D6E7F2A4B5C6D7E8F9A0B1C2D3E4F5A6B7C8D9E",
            supportsOfflineDownload: true,
            dependencies: [],
            availableVersions: ["1.94.2", "1.93.1", "1.92.0"],
            locale: "en-US"
        ),
        WinGetPackageDetail(
            name: "7-Zip",
            publisher: "Igor Pavlov",
            latestVersion: "23.01",
            description: "File archiver with a high compression ratio.",
            source: "winget",
            installerType: .msi,
            architecture: .x64,
            scope: .machine,
            installerURL: URL(string: "https://www.7-zip.org/a/7z2301-x64.msi"),
            sha256: "9E8D7C6B5A4F3E2D1C0B9A8F7E6D5C4B3A2918273645fabcdef0123456789ab",
            supportsOfflineDownload: true,
            dependencies: [],
            availableVersions: ["23.01", "22.01"],
            locale: "en-US"
        ),
        WinGetPackageDetail(
            name: "Notepad++",
            publisher: "Notepad++ Team",
            latestVersion: "8.6.9",
            description: "Free source code editor and Notepad replacement.",
            source: "winget",
            installerType: .exe,
            architecture: .x64,
            scope: .user,
            installerURL: URL(string: "https://github.com/notepad-plus-plus/notepad-plus-plus/releases/download/v8.6.9/npp.8.6.9.Installer.x64.exe"),
            sha256: nil,
            supportsOfflineDownload: false,
            dependencies: [],
            availableVersions: ["8.6.9", "8.6.7"],
            locale: "en-US"
        ),
    ]

    func health() async throws -> WindowsAgentInfo {
        WindowsAgentInfo(
            agentName: "demo-agent (no real connection configured)",
            windowsVersion: "10.0.19045",
            winGetVersion: "1.7.0",
            intuneWinAppUtilStatus: .notConfigured,
            lastHeartbeat: nil,
            availableDiskSpaceBytes: nil
        )
    }

    func searchPackages(query: String, source: String?) async throws -> [WinGetPackage] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return [] }
        return samplePackages
            .filter { $0.name.lowercased().contains(trimmed) || $0.publisher.lowercased().contains(trimmed) }
            .map { WinGetPackage(name: $0.name, publisher: $0.publisher, latestVersion: $0.latestVersion, description: $0.description, source: $0.source) }
    }

    func packageDetail(id: String) async throws -> WinGetPackageDetail {
        guard let match = samplePackages.first(where: { "\($0.source):\($0.name)" == id || $0.name == id }) else {
            throw DemoClientError.notFound(id)
        }
        return match
    }

    func submitDownloadJob(
        packageId: String,
        version: String,
        architecture: WinGetPackageDetail.Architecture,
        scope: WinGetPackageDetail.InstallerScope,
        locale: String?
    ) async throws -> WindowsBuildJob {
        WindowsBuildJob(
            id: UUID(),
            kind: .download,
            phase: .downloading(progress: 0.35),
            createdAt: Date(),
            updatedAt: Date(),
            packageId: packageId,
            version: version,
            architecture: architecture,
            scope: scope,
            logLines: ["Demo agent: simulated download started for \(packageId) \(version)."]
        )
    }

    func submitPackageJob(configuration: WindowsPackageConfiguration, sourceJobId: UUID) async throws -> WindowsBuildJob {
        WindowsBuildJob(
            id: UUID(),
            kind: .package,
            phase: .packaging,
            createdAt: Date(),
            updatedAt: Date(),
            packageId: sourceJobId.uuidString,
            version: "unknown",
            architecture: configuration.architecture,
            scope: .machine,
            logLines: ["Demo agent: simulated packaging job started."]
        )
    }

    func jobStatus(id: UUID) async throws -> WindowsBuildJob {
        throw DemoClientError.notFound(id.uuidString)
    }

    func cancelJob(id: UUID) async throws {
        // No-op: nothing is actually running against a demo agent.
    }

    func fetchArtifact(jobId: UUID, name: String) async throws -> URL {
        throw DemoClientError.notFound(name)
    }

    enum DemoClientError: LocalizedError {
        case notFound(String)

        var errorDescription: String? {
            switch self {
            case .notFound(let id): return "No demo data available for \"\(id)\". Connect a real Windows Build Agent."
            }
        }
    }
}
