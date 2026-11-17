import XCTest
@testable import AppPackageBuilder

final class BuildManifestTests: XCTestCase {

    func testManifestEncodesAllVersionConcepts() throws {
        let manifest = BuildManifest(
            applicationName: "Visual Studio Code",
            homebrewToken: "visual-studio-code",
            packageKind: .cask,
            applicationVersion: "1.87.2",
            homebrewVersion: "4.1.0",
            packageReceiptVersion: "1.0",
            packageIdentifier: "com.AKVERMA.visual-studio-code",
            architecture: .universal,
            packagingMode: .enterprisePayload,
            sourceURL: "https://example.com/vscode.zip",
            sha256Checksum: "abc123",
            buildDate: Date(timeIntervalSince1970: 0),
            builderApplicationVersion: BuildManifest.currentBuilderVersion,
            signingIdentity: nil,
            outputFiles: ["vscode-Installer.pkg"]
        )

        let data = try manifest.encodedJSON()
        let json = try XCTUnwrap(String(data: data, encoding: .utf8))

        XCTAssertTrue(json.contains("\"applicationVersion\" : \"1.87.2\""))
        XCTAssertTrue(json.contains("\"homebrewVersion\" : \"4.1.0\""))
        XCTAssertTrue(json.contains("\"packageReceiptVersion\" : \"1.0\""))
        XCTAssertTrue(json.contains("\"builderApplicationVersion\""))

        // Round-trips cleanly.
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(BuildManifest.self, from: data)
        XCTAssertEqual(decoded.homebrewToken, "visual-studio-code")
    }
}
