import XCTest
@testable import AppPackageBuilder

final class ScriptGeneratorServiceTests: XCTestCase {
    let generator = ScriptGeneratorService()

    private func caskConfig(token: String = "visual-studio-code") -> PackageConfiguration {
        var config = PackageConfiguration.draft()
        config.applicationName = "Visual Studio Code"
        config.homebrewToken = token
        config.packageKind = .cask
        config.packageIdentifier = "com.AKVERMA.visual-studio-code"
        config.packageVersion = "1.0"
        return config
    }

    private func caskInfo(token: String = "visual-studio-code") -> BrewPackageInfo {
        BrewPackageInfo(
            token: token, name: "Visual Studio Code", kind: .cask, description: nil, homepage: nil,
            version: "1.87.2", sourceURL: "https://example.com/vscode.zip", sha256: "abc",
            declaresService: false, hasArmVariant: true, hasIntelVariant: true,
            artifactAppNames: ["Visual Studio Code.app"]
        )
    }

    func testPostinstallRejectsInvalidToken() {
        var config = caskConfig()
        config.homebrewToken = "; rm -rf / #"
        XCTAssertThrowsError(try generator.generatePostinstallScript(configuration: config, packageInfo: caskInfo()))
    }

    func testPostinstallNeverUsesBashDashC() throws {
        let script = try generator.generatePostinstallScript(configuration: caskConfig(), packageInfo: caskInfo())
        XCTAssertFalse(script.contains("bash -c"), "postinstall must never shell out via bash -c with interpolated content")
        XCTAssertFalse(script.contains("bash -lc"))
    }

    func testPostinstallQuotesTokenSafely() throws {
        let script = try generator.generatePostinstallScript(configuration: caskConfig(), packageInfo: caskInfo())
        XCTAssertTrue(script.contains("PKG_TOKEN='visual-studio-code'"))
    }

    func testPostinstallHandlesNoConsoleUser() throws {
        let script = try generator.generatePostinstallScript(configuration: caskConfig(), packageInfo: caskInfo())
        XCTAssertTrue(script.contains("loginwindow"))
        XCTAssertTrue(script.contains("exit 1"))
    }

    func testDetectionScriptChecksBundleVersionFallback() throws {
        let script = try generator.generateDetectionScript(configuration: caskConfig(), packageInfo: caskInfo())
        XCTAssertTrue(script.contains("CFBundleShortVersionString"))
        XCTAssertTrue(script.contains("CFBundleVersion"))
    }

    func testUninstallScriptStopsServiceForFormulaWithService() throws {
        var config = caskConfig(token: "redis")
        config.packageKind = .formula
        let info = BrewPackageInfo(
            token: "redis", name: "Redis", kind: .formula, description: nil, homepage: nil,
            version: "7.2.4", sourceURL: nil, sha256: nil, declaresService: true,
            hasArmVariant: true, hasIntelVariant: true, artifactAppNames: []
        )
        let script = try generator.generateUninstallScript(configuration: config, packageInfo: info)
        XCTAssertTrue(script.contains("services stop"))
    }

    func testGeneratorRejectsInvalidPackageIdentifier() {
        var config = caskConfig()
        config.packageIdentifier = "not_a_reverse_dns"
        XCTAssertThrowsError(try generator.generatePostinstallScript(configuration: config, packageInfo: caskInfo()))
    }
}
