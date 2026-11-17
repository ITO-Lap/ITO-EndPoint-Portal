import XCTest
@testable import AppPackageBuilder

/// Pure YAML-parsing tests for `WinGetManifestService.parse(...)`, using
/// inline fixture strings representative of the real WinGet installer
/// manifest schema (`manifest.installer.*.yaml`). No network access —
/// `WinGetManifestService.fetchInstallerManifest` was refactored to extract
/// this pure `parse` function specifically so it's testable without hitting
/// `raw.githubusercontent.com`.
final class WinGetManifestServiceTests: XCTestCase {

    private let installerYAML = """
    PackageIdentifier: 7zip.7zip
    PackageVersion: 23.01
    InstallerLocale: en-US
    InstallerType: exe
    Scope: machine
    InstallerSwitches:
      Silent: /S
      SilentWithProgress: /S
    Installers:
      - Architecture: x64
        InstallerType: exe
        InstallerUrl: https://www.7-zip.org/a/7z2301-x64.exe
        InstallerSha256: 1E6217B7C5B3A6D5B6F6A8C9D0E1F2A3B4C5D6E7F8091A2B3C4D5E6F708192A3
        Scope: machine
        InstallerSwitches:
          Silent: /S
        AppsAndFeaturesEntries:
          - ProductCode: '{23170F69-40C1-2701-2301-000001000000}'
            UpgradeCode: '{23170F69-40C1-2701-0000-000004000000}'
      - Architecture: x86
        InstallerType: exe
        InstallerUrl: https://www.7-zip.org/a/7z2301.exe
        InstallerSha256: 2E6217B7C5B3A6D5B6F6A8C9D0E1F2A3B4C5D6E7F8091A2B3C4D5E6F708192A4
        Scope: machine
    ManifestType: installer
    ManifestVersion: 1.6.0
    """

    private let localeYAML = """
    PackageIdentifier: 7zip.7zip
    PackageVersion: 23.01
    PackageLocale: en-US
    Publisher: Igor Pavlov
    PackageName: 7-Zip
    License: LGPL-2.1-or-later
    ShortDescription: File archiver with a high compression ratio
    ManifestType: defaultLocale
    ManifestVersion: 1.6.0
    """

    func testParsesX64InstallerFieldsFromRealisticManifestSchema() throws {
        let manifest = try WinGetManifestService.parse(
            installerYAML: installerYAML,
            localeYAML: localeYAML,
            packageId: "7zip.7zip",
            version: "23.01",
            preferredArchitecture: .x64,
            preferredInstallerType: nil
        )

        XCTAssertEqual(manifest.packageId, "7zip.7zip")
        XCTAssertEqual(manifest.version, "23.01")
        XCTAssertEqual(manifest.installerURL, URL(string: "https://www.7-zip.org/a/7z2301-x64.exe"))
        XCTAssertEqual(manifest.installerType, .exe)
        XCTAssertEqual(manifest.architecture, .x64)
        XCTAssertEqual(manifest.scope, .machine)
        XCTAssertEqual(manifest.sha256, "1e6217b7c5b3a6d5b6f6a8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3")
        XCTAssertEqual(manifest.silentInstallSwitches, "/S")
        XCTAssertEqual(manifest.upgradeCode, "{23170F69-40C1-2701-0000-000004000000}")
        XCTAssertEqual(manifest.productCode, "{23170F69-40C1-2701-2301-000001000000}")
        XCTAssertEqual(manifest.expectedOutputName, "7-Zip")
        XCTAssertEqual(manifest.locale, "en-US")
        XCTAssertTrue(manifest.missingFields.isEmpty)
    }

    func testSelectsX86InstallerWhenX86Preferred() throws {
        let manifest = try WinGetManifestService.parse(
            installerYAML: installerYAML,
            localeYAML: nil,
            packageId: "7zip.7zip",
            version: "23.01",
            preferredArchitecture: .x86,
            preferredInstallerType: nil
        )

        XCTAssertEqual(manifest.architecture, .x86)
        XCTAssertEqual(manifest.installerURL, URL(string: "https://www.7-zip.org/a/7z2301.exe"))
        // The x86 entry has no AppsAndFeaturesEntries in the fixture, so
        // those fields should be reported as missing on the Review screen.
        XCTAssertTrue(manifest.missingFields.contains("Product code"))
        XCTAssertTrue(manifest.missingFields.contains("Upgrade code"))
    }

    func testMissingLocaleManifestStillProducesAValidResultWithoutExpectedOutputName() throws {
        let manifest = try WinGetManifestService.parse(
            installerYAML: installerYAML,
            localeYAML: nil,
            packageId: "7zip.7zip",
            version: "23.01",
            preferredArchitecture: .x64,
            preferredInstallerType: nil
        )

        XCTAssertNil(manifest.expectedOutputName)
        XCTAssertEqual(manifest.installerURL, URL(string: "https://www.7-zip.org/a/7z2301-x64.exe"))
    }

    func testMalformedYamlThrowsMalformedManifestError() {
        let notAMapping = "- just\n- a\n- list\n"
        XCTAssertThrowsError(try WinGetManifestService.parse(
            installerYAML: notAMapping,
            localeYAML: nil,
            packageId: "7zip.7zip",
            version: "23.01",
            preferredArchitecture: .x64,
            preferredInstallerType: nil
        )) { error in
            guard case WinGetManifestServiceError.malformedManifest = error else {
                return XCTFail("expected malformedManifest, got \(error)")
            }
        }
    }

    func testMissingInstallersKeyThrowsMalformedManifestError() {
        let noInstallers = """
        PackageIdentifier: 7zip.7zip
        PackageVersion: 23.01
        ManifestType: installer
        """
        XCTAssertThrowsError(try WinGetManifestService.parse(
            installerYAML: noInstallers,
            localeYAML: nil,
            packageId: "7zip.7zip",
            version: "23.01",
            preferredArchitecture: .x64,
            preferredInstallerType: nil
        )) { error in
            guard case WinGetManifestServiceError.malformedManifest = error else {
                return XCTFail("expected malformedManifest, got \(error)")
            }
        }
    }

    func testNonHttpsInstallerUrlIsRejected() {
        let httpYAML = """
        PackageIdentifier: bad.package
        PackageVersion: 1.0
        Installers:
          - Architecture: x64
            InstallerType: exe
            InstallerUrl: http://example.com/installer.exe
        """
        XCTAssertThrowsError(try WinGetManifestService.parse(
            installerYAML: httpYAML,
            localeYAML: nil,
            packageId: "bad.package",
            version: "1.0",
            preferredArchitecture: .x64,
            preferredInstallerType: nil
        )) { error in
            guard case WinGetManifestServiceError.malformedManifest = error else {
                return XCTFail("expected malformedManifest, got \(error)")
            }
        }
    }
}
