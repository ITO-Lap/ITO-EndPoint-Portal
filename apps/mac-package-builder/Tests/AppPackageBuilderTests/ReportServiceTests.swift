import XCTest
@testable import AppPackageBuilder

final class ReportServiceTests: XCTestCase {
    let service = ReportService()

    private func manifest(outputFiles: [String] = ["redis-Installer.pkg", "redis-detect.sh"]) -> BuildManifest {
        BuildManifest(
            applicationName: "Redis",
            homebrewToken: "redis",
            packageKind: .formula,
            applicationVersion: "7.2.4",
            homebrewVersion: "Homebrew 6.0.22",
            packageReceiptVersion: "1.0",
            packageIdentifier: "com.AKVERMA.redis",
            architecture: .automatic,
            packagingMode: .enterprisePayload,
            sourceURL: nil,
            sha256Checksum: nil,
            buildDate: Date(timeIntervalSince1970: 0),
            builderApplicationVersion: BuildManifest.currentBuilderVersion,
            signingIdentity: "Developer ID Installer: AKVERMA LLC",
            outputFiles: outputFiles
        )
    }

    private func inspection() -> PackageInspectionReport {
        PackageInspectionReport(
            identifier: "com.AKVERMA.redis",
            version: "7.2.4",
            installLocation: "/",
            payloadFileCount: 42,
            samplePayloadPaths: ["./Applications", "./Applications/Redis.app"],
            scriptNames: ["postinstall"],
            signatureStatus: "signed by a certificate trusted by macOS",
            sizeBytes: 1_048_576
        )
    }

    func testReportIncludesManifestAndRequirementFacts() {
        let validation = ValidationSummary(checks: [
            RequirementCheck(name: "Homebrew", status: .pass, detail: "Installed (Homebrew 6.0.22)"),
            RequirementCheck(name: "Signing Certificate", status: .fail, detail: "No Developer ID Installer certificate found")
        ])

        let html = service.generateValidationReportHTML(
            manifest: manifest(),
            validation: validation,
            inspection: inspection(),
            signatureVerification: "Signed by a certificate trusted by macOS",
            notarizationValidation: "The validate action worked!"
        )

        XCTAssertTrue(html.contains("Redis 7.2.4"))
        XCTAssertTrue(html.contains("com.AKVERMA.redis"))
        XCTAssertTrue(html.contains("Homebrew"))
        XCTAssertTrue(html.contains("Signing Certificate"))
        XCTAssertTrue(html.contains("The validate action worked!"))
        XCTAssertTrue(html.contains("redis-Installer.pkg"))
        XCTAssertTrue(html.contains("42"))
        XCTAssertTrue(html.contains("postinstall"))
    }

    func testReportNotesUnavailableInspectionRatherThanFabricatingFacts() {
        let html = service.generateValidationReportHTML(
            manifest: manifest(),
            validation: ValidationSummary(checks: []),
            inspection: nil,
            signatureVerification: nil,
            notarizationValidation: nil
        )

        XCTAssertTrue(html.contains("Package inspection unavailable"))
        XCTAssertTrue(html.contains("not run"))
    }

    func testReportEscapesHTMLFromUntrustedFields() {
        var infected = manifest()
        infected = BuildManifest(
            applicationName: "<script>alert(1)</script>",
            homebrewToken: infected.homebrewToken,
            packageKind: infected.packageKind,
            applicationVersion: infected.applicationVersion,
            homebrewVersion: infected.homebrewVersion,
            packageReceiptVersion: infected.packageReceiptVersion,
            packageIdentifier: infected.packageIdentifier,
            architecture: infected.architecture,
            packagingMode: infected.packagingMode,
            sourceURL: infected.sourceURL,
            sha256Checksum: infected.sha256Checksum,
            buildDate: infected.buildDate,
            builderApplicationVersion: infected.builderApplicationVersion,
            signingIdentity: infected.signingIdentity,
            outputFiles: infected.outputFiles
        )

        let html = service.generateValidationReportHTML(
            manifest: infected,
            validation: ValidationSummary(checks: []),
            inspection: nil,
            signatureVerification: nil,
            notarizationValidation: nil
        )

        XCTAssertFalse(html.contains("<script>alert(1)</script>"))
        XCTAssertTrue(html.contains("&lt;script&gt;"))
    }
}
