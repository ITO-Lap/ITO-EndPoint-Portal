import XCTest
@testable import AppPackageBuilder

final class LocalInstallerTests: XCTestCase {
    private var tmp: URL!

    override func setUpWithError() throws {
        tmp = FileManager.default.temporaryDirectory.appendingPathComponent("li-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws { try? FileManager.default.removeItem(at: tmp) }

    private func write(_ name: String, _ data: Data) throws -> URL {
        let u = tmp.appendingPathComponent(name); try FileManager.default.createDirectory(at: u.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: u); return u
    }

    // MARK: Writer

    func testEncryptThenVerifyRoundTrip_AcrossChunkBoundaries() throws {
        for size in [0, 1, 15, 16, 17, 1024 * 1024 - 1, 1024 * 1024, 1024 * 1024 + 5, 3 * 1024 * 1024 + 7] {
            let plain = Data((0..<size).map { UInt8(truncatingIfNeeded: $0 &* 31 &+ 7) })
            let input = try write("in-\(size).bin", plain)
            let out = tmp.appendingPathComponent("out-\(size).bin")
            let enc = try IntuneWinWriter.encrypt(input: input, output: out)
            XCTAssertEqual(enc.plainSize, Int64(size))
            // ciphertext = PKCS7-padded plaintext; file = 32 (MAC) + 16 (IV) + ciphertext
            let expected = 48 + (size / 16 + 1) * 16
            XCTAssertEqual(try Data(contentsOf: out).count, expected, "size \(size)")
            XCTAssertNoThrow(try IntuneWinWriter.verifyEncryptedFile(out, enc: enc), "size \(size)")
        }
    }

    func testVerificationDetectsTampering() throws {
        let input = try write("a.bin", Data(repeating: 9, count: 5000))
        let out = tmp.appendingPathComponent("a.enc")
        let enc = try IntuneWinWriter.encrypt(input: input, output: out)
        var bytes = try Data(contentsOf: out); bytes[200] ^= 0xFF; try bytes.write(to: out)
        XCTAssertThrowsError(try IntuneWinWriter.verifyEncryptedFile(out, enc: enc))
    }

    func testCreateProducesDocumentedContainer() async throws {
        let src = tmp.appendingPathComponent("src", isDirectory: true)
        _ = try write("src/app.msi", Data("MSI-BYTES".utf8)); _ = try write("src/sub/data.txt", Data("x".utf8)); _ = try write("src/.DS_Store", Data("junk".utf8))
        let out = tmp.appendingPathComponent("out/App-1.0-x64.intunewin")
        let r = try await IntuneWinWriter().create(sourceFolder: src, setupFile: "app.msi", applicationName: "A & <B>", outputFile: out)
        XCTAssertTrue(r.selfVerified)
        XCTAssertEqual(r.setupFile, "app.msi")
        let listing = try await ProcessRunner().run("/usr/bin/unzip", arguments: ["-Z1", out.path], currentDirectory: nil, environment: nil, onOutputLine: nil).stdout
        XCTAssertEqual(Set(listing.split(separator: "\n").map(String.init)),
                       ["IntuneWinPackage/Contents/IntunePackage.intunewin", "IntuneWinPackage/Metadata/Detection.xml"])
        // Entry order matches other tools (Contents first) and nothing is compressed, like a package from WinTuner.
        XCTAssertEqual(listing.split(separator: "\n").map(String.init), ["IntuneWinPackage/Contents/IntunePackage.intunewin", "IntuneWinPackage/Metadata/Detection.xml"])
        let verbose = try await ProcessRunner().run("/usr/bin/unzip", arguments: ["-Z", out.path], currentDirectory: nil, environment: nil, onOutputLine: nil).stdout
        XCTAssertFalse(verbose.contains("defN"))
        let xml = try await ProcessRunner().run("/usr/bin/unzip", arguments: ["-p", out.path, "IntuneWinPackage/Metadata/Detection.xml"], currentDirectory: nil, environment: nil, onOutputLine: nil).stdout
        XCTAssertTrue(xml.contains("<SetupFile>app.msi</SetupFile>"))
        XCTAssertTrue(xml.contains("<Name>A &amp; &lt;B&gt;</Name>"))
        XCTAssertTrue(xml.contains("<ProfileIdentifier>ProfileVersion1</ProfileIdentifier>"))
        XCTAssertTrue(xml.contains("<FileDigestAlgorithm>SHA256</FileDigestAlgorithm>"))
    }

    func testCreateRejectsBadSetupFilesAndMissingSource() async throws {
        let src = tmp.appendingPathComponent("s", isDirectory: true); _ = try write("s/app.msi", Data("x".utf8))
        let out = tmp.appendingPathComponent("o.intunewin")
        for bad in ["../app.msi", "/etc/passwd", "", "nope.msi"] {
            do { _ = try await IntuneWinWriter().create(sourceFolder: src, setupFile: bad, applicationName: "A", outputFile: out); XCTFail("accepted \(bad)") } catch {}
        }
        do { _ = try await IntuneWinWriter().create(sourceFolder: tmp.appendingPathComponent("missing"), setupFile: "app.msi", applicationName: "A", outputFile: out); XCTFail() } catch {}
        XCTAssertFalse(FileManager.default.fileExists(atPath: out.path))
    }

    // MARK: Inspector

    func testFileNameHeuristics() {
        XCTAssertEqual(LocalInstallerInspector.architecture(fromFileName: "npp.8.9.8.1.Installer.x64.exe"), .x64)
        XCTAssertEqual(LocalInstallerInspector.architecture(fromFileName: "tool_arm64_setup.exe"), .arm64)
        XCTAssertEqual(LocalInstallerInspector.architecture(fromFileName: "tool-win32.msi"), .x86)
        XCTAssertNil(LocalInstallerInspector.architecture(fromFileName: "setup.exe"))
        XCTAssertEqual(LocalInstallerInspector.version(fromFileName: "PLSQL-Developer-17.0.3.2262-x64.msi"), "17.0.3.2262")
        XCTAssertEqual(LocalInstallerInspector.appName(fromFileName: "PLSQL-Developer-17.0.3.2262-x64.msi"), "PLSQL Developer")
    }

    func testUnreadableMSIKeepsStandardInstallButNeverGuessesUninstall() throws {
        // A file that is not a real MSI database: file-name hints only, and no invented ProductCode/uninstall.
        let g = try XCTUnwrap(LocalInstallerInspector.inspect(try write("Google-Chrome-Dev-160.0.8157.0-x64.msi", Data("x".utf8))))
        XCTAssertEqual(g.installCommand, "msiexec /i \"Google-Chrome-Dev-160.0.8157.0-x64.msi\" /qn /norestart")
        XCTAssertEqual(g.confidence, .likely)
        XCTAssertEqual(g.uninstallCommand, "")
        XCTAssertEqual(g.version, "160.0.8157.0"); XCTAssertEqual(g.architecture, .x64)
    }

    func testExeTechnologyAndUnknownAreNeverGuessed() throws {
        let nsis = try write("a.exe", Data("MZ".utf8) + Data(count: 100) + Data("Nullsoft Install System".utf8))
        XCTAssertEqual(LocalInstallerInspector.inspect(nsis)?.installCommand, "\"a.exe\" /S")
        XCTAssertEqual(LocalInstallerInspector.inspect(nsis)?.confidence, .likely)
        let inno = try write("b.exe", Data("MZ".utf8) + Data("Inno Setup Setup Data (6.2)".utf8))
        XCTAssertTrue(LocalInstallerInspector.inspect(inno)?.installCommand.contains("/VERYSILENT") == true)
        let unknown = try write("c.exe", Data("MZ".utf8) + Data(count: 300))
        let g = try XCTUnwrap(LocalInstallerInspector.inspect(unknown))
        XCTAssertEqual(g.confidence, .unknown); XCTAssertEqual(g.installCommand, ""); XCTAssertEqual(g.uninstallCommand, "")
        XCTAssertNil(LocalInstallerInspector.inspect(try write("d.txt", Data("x".utf8))))
    }

    // MARK: Service

    private func request(_ source: URL, setup: String, install: String = "\"a.exe\" /S", uninstall: String = "\"C:\\Program Files\\A\\unins000.exe\" /S") -> LocalInstallerRequest {
        LocalInstallerRequest(source: source, isFolder: false, setupFile: setup, appName: "My App", version: "1.2.3", architecture: .x64,
                              installCommand: install, uninstallCommand: uninstall, productCode: "", outputBase: tmp.appendingPathComponent("out").path)
    }

    func testCommandValidationRejectsShellOperators() throws {
        let s = LocalInstallerPackagerService()
        let f = try write("a.exe", Data("MZ".utf8))
        XCTAssertThrowsError(try s.validate(request(f, setup: "a.exe", install: "a.exe /S & calc.exe")))
        XCTAssertThrowsError(try s.validate(request(f, setup: "a.exe", uninstall: "x | y")))
        XCTAssertThrowsError(try s.validate(request(f, setup: "a.exe", install: "")))
        XCTAssertThrowsError(try s.validate(request(f, setup: "a.txt")))
        var r = request(f, setup: "a.exe"); r.productCode = "not-a-guid"
        XCTAssertThrowsError(try s.validate(r))
        XCTAssertNoThrow(try s.validate(request(f, setup: "a.exe")))
    }

    func testSinglefilePackagesOnlyTheChosenInstaller_AndWritesHonestMetadata() async throws {
        // A sibling file in the same folder must NOT end up in the package.
        let installer = try write("dl/a.exe", Data("MZ-installer".utf8)); _ = try write("dl/secret.txt", Data("do-not-package".utf8))
        let outcome = try await LocalInstallerPackagerService().package(request(installer, setup: "a.exe")) { _ in }
        XCTAssertEqual(outcome.result.outputURL.lastPathComponent, "My-App-1.2.3-x64.intunewin")
        XCTAssertTrue(outcome.result.selfVerified)
        let bytes = try Data(contentsOf: outcome.result.outputURL)
        XCTAssertNil(bytes.range(of: Data("secret.txt".utf8)))
        let info = try JSONSerialization.jsonObject(with: Data(contentsOf: outcome.infoFile)) as? [String: Any]
        XCTAssertEqual(info?["windowsInstallationTested"] as? Bool, false)
        XCTAssertEqual(info?["packageSha256"] as? String, outcome.result.sha256)
        XCTAssertTrue(try String(contentsOf: outcome.commandsFile).contains("NOT been installed or tested on Windows"))
    }

    func testOutputNamingIsSanitised() {
        XCTAssertEqual(LocalInstallerPackagerService.outputFileName(appName: "../Evil App/..", version: "1.0 beta", architecture: .arm64), "Evil-App-1.0-beta-arm64.intunewin")
    }

    /// Opt-in: LOCAL_INSTALLER_SAMPLES="/path/a.msi:/path/b.exe" LOCAL_INSTALLER_OUT=/dir packages real installers so the
    /// result can be verified by an independent tool (openssl/python). Skipped when the variables are not set.
    func testRealInstallersFromEnvironment() async throws {
        guard let list = ProcessInfo.processInfo.environment["LOCAL_INSTALLER_SAMPLES"], let outDir = ProcessInfo.processInfo.environment["LOCAL_INSTALLER_OUT"] else {
            throw XCTSkip("LOCAL_INSTALLER_SAMPLES not set")
        }
        for path in list.split(separator: ":").map(String.init) {
            let url = URL(fileURLWithPath: path)
            let g = try XCTUnwrap(LocalInstallerInspector.inspect(url))
            var r = LocalInstallerRequest(source: url, isFolder: false, setupFile: url.lastPathComponent, appName: g.appName, version: g.version.isEmpty ? "1.0" : g.version,
                architecture: g.architecture, installCommand: g.installCommand.isEmpty ? "\"\(url.lastPathComponent)\" /S" : g.installCommand,
                uninstallCommand: g.uninstallCommand.isEmpty ? "\"C:\\Program Files\\App\\unins000.exe\" /S" : g.uninstallCommand, productCode: "", outputBase: outDir)
            r.productCode = ""
            let o = try await LocalInstallerPackagerService().package(r) { print("LOG", $0) }
            print("RESULT", o.result.outputURL.path, o.result.sizeBytes, o.result.sha256, "tech=\(g.tech.rawValue) conf=\(g.confidence.label)")
        }
    }

    // MARK: MSI reader

    /// Synthetic MSI built with the documented compound-file / Property-table layout (ProductName has a trailing space, template is Arm64).
    private static let msiFixtureBase64 = "0M8R4KGxGuEAAAAAAAAAAAAAAAAAAAAAPgADAP7/CQAGAAAAAAAAAAAAAAABAAAAAgAAAAAAAAAAEAAAAQAAAAEAAAD+////AAAAAAAAAAD////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9/////v///wMAAAD+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7///8CAAAAAwAAAP7////+/////v///wcAAAD+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+/////v////7////+////UgBvAG8AdAAgAEUAbgB0AHIAeQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABYABQH//////////wEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAIAAAAAAABASFlF8kRoRTdHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAACAf////8CAAAA/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAAAAAAAEBIPz93RWxEajvkRSRIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAIB/////wMAAAD/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAKAAAAAAAAAAQEg/P3dFbERqPrJEL0gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAgH/////BAAAAP////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAALAAAAAAAAAABAFMAaAAzADMAdABKADUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEgACAf////8FAAAA/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAAEAAAAAAAAAAUAUwB1AG0AbQBhAHIAeQBJAG4AZgBvAHIAbQBhAHQAaQBvAG4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAIB////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAFMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAgADAAQABQAGAAcACAAJAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQcm9kdWN0Q29kZVByb2R1Y3RWZXJzaW9uTWFudWZhY3R1cmVyUHJvZHVjdE5hbWVVcGdyYWRlQ29kZXsxMjM0NTY3OC1BQkNELTRFRjAtOTg3Ni0wMTIzNDU2Nzg5QUJ9Mi40LjZDb250b3NvQ29udG9zbyBUb29sIHtBQUFBQUFBQS0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDB9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADkBAAACwABAA4AAQAMAAEACwABAAsAAQAmAAEABQABAAcAAQANAAEAJgABAAAAAAAAAAAAAAAAAAAAAAAAAAAANzI2MgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP7/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAMAAAACMAAAABAAAABwAAABAAAAAeAAAACwAAAEFybTY0OzEwMzMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

    func testMSIReaderReadsPropertiesFromTheFileItself() throws {
        let url = try write("fixture.msi", try XCTUnwrap(Data(base64Encoded: Self.msiFixtureBase64)))
        let msi = try MSIReader.read(url)
        XCTAssertEqual(msi.productCode, "{12345678-ABCD-4EF0-9876-0123456789AB}")
        XCTAssertEqual(msi.upgradeCode, "{AAAAAAAA-0000-0000-0000-000000000000}")
        XCTAssertEqual(msi.productVersion, "2.4.6")
        XCTAssertEqual(msi.manufacturer, "Contoso")
        XCTAssertEqual(msi.productName, "Contoso Tool")
        XCTAssertEqual(msi.architecture, .arm64)
    }

    func testInspectorFillsUninstallAndDetectionFromTheMSI() throws {
        let url = try write("anything-9.9.msi", try XCTUnwrap(Data(base64Encoded: Self.msiFixtureBase64)))
        let g = try XCTUnwrap(LocalInstallerInspector.inspect(url))
        XCTAssertEqual(g.productCode, "{12345678-ABCD-4EF0-9876-0123456789AB}")
        XCTAssertEqual(g.uninstallCommand, "msiexec /x \"{12345678-ABCD-4EF0-9876-0123456789AB}\" /qn /norestart")
        XCTAssertEqual(g.version, "2.4.6")            // from the MSI, not the file name
        XCTAssertEqual(g.appName, "Contoso Tool"); XCTAssertEqual(g.publisher, "Contoso"); XCTAssertEqual(g.architecture, .arm64)
        XCTAssertEqual(g.confidence, .verified)
    }

    func testUnreadableMSIFallsBackHonestly() throws {
        let g = try XCTUnwrap(LocalInstallerInspector.inspect(try write("broken-1.0.msi", Data("not an msi".utf8))))
        XCTAssertEqual(g.productCode, ""); XCTAssertEqual(g.uninstallCommand, ""); XCTAssertEqual(g.confidence, .likely)
        XCTAssertTrue(g.note.contains("Could not read"))
        XCTAssertThrowsError(try MSIReader.read(try write("x.msi", Data("not an msi".utf8))))
    }

    func testMSIStreamNameCodecRoundTrips() {
        for n in ["Property", "_StringPool", "_StringData"] { XCTAssertEqual(MSIReader.decodeStreamName(MSIReader.encodeStreamName(n)), "!" + n) }
    }

    func testPackagingAnMSIUsesTheProductCodeForUninstallAndWritesDetection() async throws {
        let url = try write("dl/tool.msi", try XCTUnwrap(Data(base64Encoded: Self.msiFixtureBase64)))
        let g = try XCTUnwrap(LocalInstallerInspector.inspect(url))
        // Uninstall left empty on purpose: the service derives it from the ProductCode.
        let req = LocalInstallerRequest(source: url, isFolder: false, setupFile: "tool.msi", appName: g.appName, version: g.version, architecture: g.architecture,
                                        installCommand: g.installCommand, uninstallCommand: "", productCode: g.productCode, publisher: g.publisher, outputBase: tmp.appendingPathComponent("out").path)
        let o = try await LocalInstallerPackagerService().package(req) { _ in }
        let commands = try String(contentsOf: o.commandsFile)
        XCTAssertTrue(commands.contains("msiexec /x \"{12345678-ABCD-4EF0-9876-0123456789AB}\" /qn /norestart"))
        XCTAssertTrue(commands.contains("product code {12345678-ABCD-4EF0-9876-0123456789AB}, version >= 2.4.6"))
        let det = try String(contentsOf: try XCTUnwrap(o.detectionFile))
        XCTAssertTrue(det.contains("'{12345678-ABCD-4EF0-9876-0123456789AB}'")); XCTAssertTrue(det.contains("$min = '2.4.6'")); XCTAssertTrue(det.contains("exit 1"))
        let info = try JSONSerialization.jsonObject(with: Data(contentsOf: o.infoFile)) as? [String: Any]
        XCTAssertEqual(info?["productCode"] as? String, "{12345678-ABCD-4EF0-9876-0123456789AB}")
        XCTAssertEqual(info?["uninstallCommand"] as? String, "msiexec /x \"{12345678-ABCD-4EF0-9876-0123456789AB}\" /qn /norestart")
    }

    /// Opt-in ground truth: LOCAL_MSI_SAMPLES="path|{PRODUCTCODE}|version|publisher|arch;..." checks real MSIs against values read by an independent parser.
    func testRealMSIsMatchGroundTruth() throws {
        guard let spec = ProcessInfo.processInfo.environment["LOCAL_MSI_SAMPLES"] else { throw XCTSkip("LOCAL_MSI_SAMPLES not set") }
        for item in spec.split(separator: ";") {
            let f = item.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
            let m = try MSIReader.read(URL(fileURLWithPath: f[0]))
            XCTAssertEqual(m.productCode, f[1]); XCTAssertEqual(m.productVersion, f[2]); XCTAssertEqual(m.manufacturer, f[3]); XCTAssertEqual(m.architecture?.rawValue, f[4])
            print("REAL OK", (f[0] as NSString).lastPathComponent, m.productCode ?? "-", m.productVersion ?? "-", m.manufacturer ?? "-", m.architecture?.rawValue ?? "-", m.productName ?? "-")
        }
    }

    // MARK: Intune portal pre-fill (MsiInfo)

    private func detectionXML(of package: URL) async throws -> String {
        try await ProcessRunner().run("/usr/bin/unzip", arguments: ["-p", package.path, "IntuneWinPackage/Metadata/Detection.xml"], currentDirectory: nil, environment: nil, onOutputLine: nil).stdout
    }

    func testMSIPackageEmbedsMsiInfoSoThePortalCanPrefillProgram() async throws {
        let url = try write("dl/tool.msi", try XCTUnwrap(Data(base64Encoded: Self.msiFixtureBase64)))
        let g = try XCTUnwrap(LocalInstallerInspector.inspect(url))
        let req = LocalInstallerRequest(source: url, isFolder: false, setupFile: "tool.msi", appName: g.appName, version: "9.9.9", architecture: g.architecture,
                                        installCommand: g.installCommand, uninstallCommand: g.uninstallCommand, productCode: g.productCode, outputBase: tmp.appendingPathComponent("o").path)
        let o = try await LocalInstallerPackagerService().package(req) { _ in }
        let xml = try await detectionXML(of: o.result.outputURL)
        // Values come from the MSI itself (not from the editable form fields).
        XCTAssertTrue(xml.contains("<MsiProductCode>{12345678-ABCD-4EF0-9876-0123456789AB}</MsiProductCode>"))
        XCTAssertTrue(xml.contains("<MsiProductVersion>2.4.6</MsiProductVersion>"))
        XCTAssertTrue(xml.contains("<MsiExecutionContext>System</MsiExecutionContext>"))
        // Same element names and order as a package made by Microsoft-compatible tooling.
        let opening = try NSRegularExpression(pattern: "<([A-Za-z]+)>").matches(in: xml, range: NSRange(xml.startIndex..., in: xml)).map { String(xml[Range($0.range(at: 1), in: xml)!]) }
        XCTAssertEqual(Array(opening.drop(while: { $0 != "MsiInfo" })), ["MsiInfo", "MsiProductCode", "MsiProductVersion", "MsiExecutionContext", "MsiRequiresLogon", "MsiRequiresReboot",
                                                                         "MsiIsMachineInstall", "MsiIsUserInstall", "MsiIncludesServices", "MsiIncludesODBCDataSource", "MsiContainsSystemRegistryKeys", "MsiContainsSystemFolders"])
        XCTAssertNotNil(xml.range(of: "</EncryptionInfo>\n  <MsiInfo>"))
    }

    func testExePackageHasNoMsiInfo() async throws {
        let exe = try write("dl/a.exe", Data("MZ".utf8))
        let o = try await LocalInstallerPackagerService().package(request(exe, setup: "a.exe")) { _ in }
        let xml = try await detectionXML(of: o.result.outputURL)
        XCTAssertFalse(xml.contains("MsiInfo"))
        XCTAssertTrue(try String(contentsOf: o.commandsFile).contains("cannot"))
    }
}
