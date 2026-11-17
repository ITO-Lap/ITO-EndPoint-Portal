import XCTest
@testable import AppPackageBuilder

final class WinTunerPreflightTests: XCTestCase {
    private func manifest(type: WinGetInstallerType = .exe, silent: String? = "/S", product: String? = "7-Zip") -> WinGetInstallerManifest {
        WinGetInstallerManifest(packageId: "a.b", version: "1", installerURL: URL(string: "https://x.test/a.exe")!,
                                installerType: type, architecture: .x64, scope: nil, sha256: "ab",
                                silentInstallSwitches: silent, silentUninstallSwitches: nil,
                                upgradeCode: nil, productCode: product, expectedOutputName: nil, locale: nil)
    }

    func testOversizeBlocks() {
        let p = WinTunerPreflight.evaluate(manifest: manifest(), configuration: .draft(packageId: "a.b"),
                                           installerBytes: WinTunerPreflight.maxSourceBytes)
        XCTAssertTrue(p.hasBlocking)
    }

    func testExeWithoutSwitchesNeedsAcknowledgement() {
        let p = WinTunerPreflight.evaluate(manifest: manifest(silent: nil), configuration: .draft(packageId: "a.b"), installerBytes: 1_000)
        XCTAssertTrue(p.needsAcknowledgement)
        XCTAssertFalse(p.hasBlocking)
    }

    func testManifestSwitchesAreOk() {
        var c = WinTunerPackageConfiguration.draft(packageId: "a.b")
        c.silentInstallerArguments = "/S"
        let p = WinTunerPreflight.evaluate(manifest: manifest(), configuration: c, installerBytes: 1_000)
        XCTAssertFalse(p.needsAcknowledgement)
        XCTAssertFalse(p.hasBlocking)
    }
}
