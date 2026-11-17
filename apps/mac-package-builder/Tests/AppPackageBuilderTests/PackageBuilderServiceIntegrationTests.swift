import XCTest
@testable import AppPackageBuilder

/// Builds a real `.pkg` via the system `pkgbuild`/`pkgutil`/`lsbom` tools
/// (Online Installer mode needs neither Homebrew nor network access) and
/// verifies the whole Phase 1 pipeline — manifest, inspection, HTML report —
/// runs end-to-end against a real artifact rather than mocked pieces.
final class PackageBuilderServiceIntegrationTests: XCTestCase {

    private func skipIfSystemToolsMissing() throws {
        let required = ["/usr/bin/pkgbuild", "/usr/sbin/pkgutil", "/usr/bin/lsbom"]
        try XCTSkipUnless(required.allSatisfy { FileManager.default.isExecutableFile(atPath: $0) }, "required system packaging tools are not present")
    }

    private func makeConfiguration(outputDir: URL) -> PackageConfiguration {
        var config = PackageConfiguration.draft()
        config.applicationName = "Redis"
        config.homebrewToken = "redis"
        config.packageKind = .formula
        config.packagingMode = .onlineInstaller
        config.packageIdentifier = "com.AKVERMA.redis"
        config.packageVersion = "1.0"
        config.outputDirectory = outputDir.path
        config.overwriteExisting = true
        config.generateUninstaller = true
        config.createDetectionScript = true
        config.signPackage = false
        config.notarizePackage = false
        return config
    }

    private func packageInfo() -> BrewPackageInfo {
        BrewPackageInfo(
            token: "redis", name: "Redis", kind: .formula, description: "In-memory store",
            homepage: "https://redis.io", version: "7.2.4", sourceURL: nil, sha256: nil,
            declaresService: false, hasArmVariant: true, hasIntelVariant: true, artifactAppNames: []
        )
    }

    func testBuildProducesInspectableManifestAndReport() async throws {
        try skipIfSystemToolsMissing()

        let outputDir = FileManager.default.temporaryDirectory.appendingPathComponent("BPB-IT-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: outputDir) }

        let service = PackageBuilderService()
        var logLines: [String] = []

        let outcome = try await service.build(
            configuration: makeConfiguration(outputDir: outputDir),
            packageInfo: packageInfo(),
            signingIdentity: nil,
            validation: ValidationSummary(checks: [
                RequirementCheck(name: "Homebrew", status: .pass, detail: "Installed")
            ]),
            log: { logLines.append($0) },
            isCancelled: { false }
        )

        XCTAssertTrue(FileManager.default.fileExists(atPath: outcome.packagePath.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: outcome.manifestPath.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: outcome.validationReportPath.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: outcome.detectionScriptPath.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: outcome.uninstallScriptPath.path))

        // Every app's output lands in its own subfolder (outputDir/redis/...),
        // not flat in the shared output directory.
        XCTAssertEqual(outcome.packagePath.deletingLastPathComponent().lastPathComponent, "redis")
        XCTAssertEqual(outcome.packagePath.deletingLastPathComponent(), outputDir.appendingPathComponent("redis"))

        // The .pkg filename itself carries the application name + version.
        XCTAssertEqual(outcome.packagePath.lastPathComponent, "Redis-1.0.pkg")

        // Manifest round-trips as valid JSON with the identifier we asked for.
        let manifestData = try Data(contentsOf: outcome.manifestPath)
        let decoded = try JSONDecoder().decode(BuildManifest.self, from: manifestData)
        XCTAssertEqual(decoded.packageIdentifier, "com.AKVERMA.redis")
        XCTAssertEqual(decoded.homebrewToken, "redis")

        // Inspection ran against the real built artifact, not the config's claims.
        XCTAssertNotNil(outcome.inspection)
        XCTAssertEqual(outcome.inspection?.identifier, "com.AKVERMA.redis")

        // The HTML report references facts from both the manifest and the inspection.
        let reportHTML = try String(contentsOf: outcome.validationReportPath, encoding: .utf8)
        XCTAssertTrue(reportHTML.contains("Redis"))
        XCTAssertTrue(reportHTML.contains("com.AKVERMA.redis"))
        XCTAssertTrue(reportHTML.contains("Homebrew"))

        XCTAssertFalse(outcome.isSigned)
        XCTAssertFalse(outcome.isNotarized)
        XCTAssertTrue(logLines.contains { $0.contains("Build complete") })
    }
}
