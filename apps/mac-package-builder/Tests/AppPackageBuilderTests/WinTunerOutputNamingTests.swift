import XCTest
@testable import AppPackageBuilder

final class WinTunerOutputNamingTests: XCTestCase {

    private var tempDirectory: URL!

    override func setUpWithError() throws {
        tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("WinTunerOutputNamingTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: tempDirectory)
    }

    func testApplicationOutputDirectoryUsesSanitizedApplicationName() {
        let directory = WinTunerOutputNaming.applicationOutputDirectory(
            baseDirectory: "/tmp/WinGetPackages",
            applicationName: "Visual Studio Code / Insiders",
            packageId: "Microsoft.VisualStudioCode"
        )

        XCTAssertEqual(directory, "/tmp/WinGetPackages/Visual-Studio-Code-Insiders")
    }

    func testApplicationOutputDirectoryFallsBackToPackageId() {
        let directory = WinTunerOutputNaming.applicationOutputDirectory(
            baseDirectory: "/tmp/WinGetPackages",
            applicationName: nil,
            packageId: "Publisher.Package"
        )

        XCTAssertEqual(directory, "/tmp/WinGetPackages/Publisher.Package")
    }

    func testApplicationOutputDirectoryExpandsHomeDirectory() {
        let directory = WinTunerOutputNaming.applicationOutputDirectory(
            baseDirectory: "~/Desktop/Packages/Windows",
            applicationName: "7-Zip",
            packageId: "7zip.7zip"
        )

        XCTAssertEqual(directory, ("~/Desktop/Packages/Windows/7-Zip" as NSString).expandingTildeInPath)
    }

    // MARK: sanitizedFileName

    func testDefaultOutputDirectoryIsWindowsPackagesFolderOnDesktop() {
        XCTAssertEqual(WinTunerPackageConfiguration().outputDirectory, "~/Desktop/Packages/Windows")
    }

    func testSanitizedFileNameReplacesSpacesAndStripsSpecialCharacters() {
        let name = WinTunerOutputNaming.sanitizedFileName(
            applicationName: "7-Zip (x64) Setup!",
            version: "23.01",
            architecture: "x64",
            fileExtension: "intunewin"
        )
        // "7-Zip (x64) Setup!" -> spaces become "-", then "(", ")", "!" are
        // stripped entirely (only letters/numbers/-/./_ survive), per
        // `PackageOutputPathing.sanitizedFileNameComponent`.
        XCTAssertEqual(name, "7-Zip-x64-Setup-23.01-x64.intunewin")
    }

    func testSanitizedFileNameHandlesUnicodeAndPunctuation() {
        let name = WinTunerOutputNaming.sanitizedFileName(
            applicationName: "Notepad++ / Café Édition",
            version: "8.6.2",
            architecture: "arm64",
            fileExtension: ".exe"
        )
        // Only letters/numbers/-/./_ survive; spaces become "-", everything
        // else (parens, slashes, plus signs) is stripped entirely.
        XCTAssertFalse(name.contains(" "))
        XCTAssertFalse(name.contains("+"))
        XCTAssertFalse(name.contains("/"))
        XCTAssertTrue(name.hasSuffix("-8.6.2-arm64.exe"))
    }

    func testSanitizedFileNameFallsBackWhenApplicationNameSanitizesToEmpty() {
        let name = WinTunerOutputNaming.sanitizedFileName(
            applicationName: "!!!///",
            version: "1.0",
            architecture: "x64",
            fileExtension: "msi"
        )
        XCTAssertEqual(name, "package-1.0-x64.msi")
    }

    func testSanitizedFileNameStripsLeadingDotsFromExtension() {
        let name = WinTunerOutputNaming.sanitizedFileName(
            applicationName: "App",
            version: "1.0",
            architecture: "x64",
            fileExtension: "..msi"
        )
        XCTAssertEqual(name, "App-1.0-x64.msi")
    }

    // MARK: nextAvailableURL

    func testNextAvailableURLReturnsProposedURLUnchangedWhenNothingExists() {
        let proposed = tempDirectory.appendingPathComponent("App-1.0-x64.intunewin")
        let result = WinTunerOutputNaming.nextAvailableURL(for: proposed)
        XCTAssertEqual(result, proposed)
    }

    func testNextAvailableURLSuffixesOnSingleCollision() throws {
        let proposed = tempDirectory.appendingPathComponent("App-1.0-x64.intunewin")
        try Data("existing".utf8).write(to: proposed)

        let result = WinTunerOutputNaming.nextAvailableURL(for: proposed)
        XCTAssertEqual(result, tempDirectory.appendingPathComponent("App-1.0-x64-2.intunewin"))
    }

    func testNextAvailableURLSkipsMultipleExistingSuffixes() throws {
        let proposed = tempDirectory.appendingPathComponent("App-1.0-x64.intunewin")
        try Data("existing".utf8).write(to: proposed)
        try Data("existing-2".utf8).write(to: tempDirectory.appendingPathComponent("App-1.0-x64-2.intunewin"))
        try Data("existing-3".utf8).write(to: tempDirectory.appendingPathComponent("App-1.0-x64-3.intunewin"))

        let result = WinTunerOutputNaming.nextAvailableURL(for: proposed)
        XCTAssertEqual(result, tempDirectory.appendingPathComponent("App-1.0-x64-4.intunewin"))
    }

    func testNextAvailableURLHandlesExtensionlessFileNames() throws {
        let proposed = tempDirectory.appendingPathComponent("no-extension-file")
        try Data("existing".utf8).write(to: proposed)

        let result = WinTunerOutputNaming.nextAvailableURL(for: proposed)
        XCTAssertEqual(result, tempDirectory.appendingPathComponent("no-extension-file-2"))
    }
}
