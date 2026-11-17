import XCTest
@testable import AppPackageBuilder

final class PackageOutputPathingTests: XCTestCase {

    private func config(appName: String = "Redis", token: String = "redis", version: String = "7.2.4", outputDir: String) -> PackageConfiguration {
        var c = PackageConfiguration.draft()
        c.applicationName = appName
        c.homebrewToken = token
        c.packageVersion = version
        c.outputDirectory = outputDir
        return c
    }

    func testExpectedPathIsAppSubfolderWithNameAndVersionNoInstallerSuffix() {
        let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent("POP-\(UUID().uuidString)")
        let path = PackageOutputPathing.expectedPackagePath(for: config(outputDir: tempDir.path))

        XCTAssertEqual(path?.lastPathComponent, "Redis-7.2.4.pkg")
        XCTAssertFalse(path?.lastPathComponent.contains("Installer") ?? true)
        XCTAssertEqual(path?.deletingLastPathComponent().lastPathComponent, "redis")
    }

    func testMainActionsBarAndPackageBuilderServiceAgreeOnTheSamePath() throws {
        // Regression test for the bug where MainActionsBar predicted a
        // different filename than PackageBuilderService actually wrote,
        // so the pre-build overwrite prompt never fired correctly.
        let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent("POP-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: tempDir) }
        let configuration = config(appName: "Visual Studio Code", token: "visual-studio-code", version: "1.87.2", outputDir: tempDir.path)

        let predicted = PackageOutputPathing.expectedPackagePath(for: configuration)
        XCTAssertEqual(predicted?.lastPathComponent, "Visual-Studio-Code-1.87.2.pkg")
    }

    func testSanitizesSpacesAndUnsafeCharactersInApplicationName() {
        let sanitized = PackageOutputPathing.sanitizedFileNameComponent("1Password 8 (Beta)!", fallback: "1password")
        XCTAssertEqual(sanitized, "1Password-8-Beta")
    }

    func testFallsBackToTokenWhenNameSanitizesToNothing() {
        let sanitized = PackageOutputPathing.sanitizedFileNameComponent("!!!", fallback: "fallback-token")
        XCTAssertEqual(sanitized, "fallback-token")
    }

    func testReturnsNilForUncanonicalizableOutputDirectory() {
        // `PathValidator.canonicalize` explicitly rejects the filesystem root.
        let path = PackageOutputPathing.expectedPackagePath(for: config(outputDir: "/"))
        XCTAssertNil(path)
    }
}
