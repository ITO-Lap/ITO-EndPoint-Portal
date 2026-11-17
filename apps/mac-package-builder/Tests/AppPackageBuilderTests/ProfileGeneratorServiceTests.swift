import XCTest
@testable import AppPackageBuilder

final class ProfileGeneratorServiceTests: XCTestCase {
    let generator = ProfileGeneratorService()

    private func signedApp(bundleID: String? = "com.example.app", teamID: String? = "TEAM1234", codeReq: String? = "identifier \"com.example.app\" and anchor apple generic") -> AppSignatureInfo {
        AppSignatureInfo(
            appPath: "/Applications/Example.app",
            appName: "Example",
            bundleIdentifier: bundleID,
            teamIdentifier: teamID,
            codeRequirement: codeReq,
            executablePath: "/Applications/Example.app/Contents/MacOS/Example",
            isSigned: bundleID != nil,
            isNotarized: false
        )
    }

    // MARK: - PPPC generation

    func testGeneratesValidPPPCPayload() throws {
        let entries = [PPPCEntry(service: .camera, decision: .allow), PPPCEntry(service: .microphone, decision: .deny)]
        let payload = try generator.generatePPPCPayload(app: signedApp(), entries: entries, payloadIdentifierPrefix: "com.AKVERMA.example")

        XCTAssertEqual(payload["PayloadType"] as? String, "com.apple.TCC.configuration-profile-policy")
        let services = try XCTUnwrap(payload["Services"] as? [String: [[String: Any]]])
        let cameraRules = try XCTUnwrap(services["Camera"])
        XCTAssertEqual(cameraRules.first?["Allowed"] as? Bool, true)
        XCTAssertEqual(cameraRules.first?["Identifier"] as? String, "com.example.app")
        let micRules = try XCTUnwrap(services["Microphone"])
        XCTAssertEqual(micRules.first?["Allowed"] as? Bool, false)
    }

    func testPPPCWithAppleEventsRequiresTarget() {
        let missingTarget = [PPPCEntry(service: .appleEvents, decision: .allow)]
        XCTAssertThrowsError(try generator.generatePPPCPayload(app: signedApp(), entries: missingTarget, payloadIdentifierPrefix: "com.AKVERMA.example")) { error in
            XCTAssertTrue(error is ProfileGeneratorError)
        }

        var withTarget = PPPCEntry(service: .appleEvents, decision: .allow)
        withTarget.targetBundleIdentifier = "com.apple.finder"
        withTarget.targetCodeRequirement = "identifier \"com.apple.finder\""
        XCTAssertNoThrow(try generator.generatePPPCPayload(app: signedApp(), entries: [withTarget], payloadIdentifierPrefix: "com.AKVERMA.example"))
    }

    // MARK: - Missing Bundle ID / Team ID

    func testPPPCMissingBundleIdentifierThrows() {
        let entries = [PPPCEntry(service: .camera, decision: .allow)]
        XCTAssertThrowsError(try generator.generatePPPCPayload(app: signedApp(bundleID: nil), entries: entries, payloadIdentifierPrefix: "x")) { error in
            guard case ProfileGeneratorError.missingBundleIdentifier = error else {
                return XCTFail("expected missingBundleIdentifier, got \(error)")
            }
        }
    }

    func testPPPCMissingCodeRequirementThrows() {
        let entries = [PPPCEntry(service: .camera, decision: .allow)]
        XCTAssertThrowsError(try generator.generatePPPCPayload(app: signedApp(codeReq: nil), entries: entries, payloadIdentifierPrefix: "x")) { error in
            guard case ProfileGeneratorError.missingCodeRequirement = error else {
                return XCTFail("expected missingCodeRequirement, got \(error)")
            }
        }
    }

    func testSystemExtensionPolicyMissingTeamIdentifierThrows() {
        let ext = DetectedSystemExtension(identifier: "com.example.ext", pointKind: .networkExtension, networkProviderKind: .contentFilter, teamIdentifier: nil, bundlePath: "/tmp/ext.appex")
        XCTAssertThrowsError(try generator.generateSystemExtensionPolicyPayload(extensions: [ext], allowUserOverrides: false, payloadIdentifierPrefix: "x")) { error in
            guard case ProfileGeneratorError.missingTeamIdentifier = error else {
                return XCTFail("expected missingTeamIdentifier, got \(error)")
            }
        }
    }

    // MARK: - Duplicate/conflict detection

    func testDetectsConflictingPPPCDecisions() {
        let entries = [
            PPPCEntry(service: .camera, decision: .allow),
            PPPCEntry(service: .camera, decision: .deny)
        ]
        let conflicts = generator.detectConflicts(in: entries)
        XCTAssertEqual(conflicts.count, 1)
        XCTAssertEqual(conflicts.first?.service, .camera)
    }

    func testNoConflictWhenDecisionsAgreeOrAreUnset() {
        let entries = [
            PPPCEntry(service: .camera, decision: .allow),
            PPPCEntry(service: .microphone, decision: nil)
        ]
        XCTAssertTrue(generator.detectConflicts(in: entries).isEmpty)
    }

    func testGenerationBlockedWhenConflictsExist() {
        let entries = [
            PPPCEntry(service: .camera, decision: .allow),
            PPPCEntry(service: .camera, decision: .deny)
        ]
        XCTAssertThrowsError(try generator.generatePPPCPayload(app: signedApp(), entries: entries, payloadIdentifierPrefix: "x"))
    }

    // MARK: - Notifications payload generation

    func testGeneratesNotificationsPayload() throws {
        var settings = NotificationSettings()
        settings.alertStyle = .alert
        settings.grouping = .byApp
        let payload = try generator.generateNotificationsPayload(app: signedApp(), settings: settings, payloadIdentifierPrefix: "com.AKVERMA.example")

        XCTAssertEqual(payload["PayloadType"] as? String, "com.apple.notificationsettings")
        let entries = try XCTUnwrap(payload["NotificationSettings"] as? [[String: Any]])
        XCTAssertEqual(entries.first?["BundleIdentifier"] as? String, "com.example.app")
        XCTAssertEqual(entries.first?["AlertType"] as? Int, 2)
        XCTAssertEqual(entries.first?["Grouping"] as? Int, 1)
    }

    func testNotificationsMissingBundleIdentifierThrows() {
        XCTAssertThrowsError(try generator.generateNotificationsPayload(app: signedApp(bundleID: nil), settings: NotificationSettings(), payloadIdentifierPrefix: "x"))
    }

    // MARK: - Vendor update-key validation

    func testKnownVendorGeneratesUpdatePayload() throws {
        let chrome = signedApp(bundleID: "com.google.Chrome")
        let payload = try generator.generateThirdPartyUpdatePayload(app: chrome, policy: .disableAutoUpdate, payloadIdentifierPrefix: "com.AKVERMA.chrome")
        let content = try XCTUnwrap(payload["PayloadContent"] as? [String: Any])
        XCTAssertNotNil(content["com.google.Keystone.Agent"])
    }

    func testUnknownVendorRefusesToInventAPreference() {
        let unknownApp = signedApp(bundleID: "com.totally.unknown.vendor")
        XCTAssertThrowsError(try generator.generateThirdPartyUpdatePayload(app: unknownApp, policy: .disableAutoUpdate, payloadIdentifierPrefix: "x")) { error in
            guard case ProfileGeneratorError.noVerifiedUpdatePreference = error else {
                return XCTFail("expected noVerifiedUpdatePreference, got \(error)")
            }
        }
    }

    func testManagedByVendorPolicyNeverGeneratesAPayload() {
        let chrome = signedApp(bundleID: "com.google.Chrome")
        XCTAssertThrowsError(try generator.generateThirdPartyUpdatePayload(app: chrome, policy: .managedByVendor, payloadIdentifierPrefix: "x"))
    }

    // MARK: - Plist validation

    func testValidPlistPassesValidation() {
        XCTAssertNoThrow(try PlistValidator.validate(["A": "b", "C": 1, "D": true, "E": ["x", "y"]]))
    }

    func testCustomPreferencesRejectsUnparseableValues() {
        let entries = [CustomPreferenceEntry(domain: "com.vendor.app", key: "enabled", type: .boolean, stringValue: "not-a-bool", scope: .user, documentationReference: "docs")]
        XCTAssertThrowsError(try generator.customPreferencesPayload(entries: entries, payloadIdentifierPrefix: "x"))
    }

    func testCustomPreferencesAcceptsAllSupportedTypes() throws {
        let entries = [
            CustomPreferenceEntry(domain: "com.vendor.app", key: "name", type: .string, stringValue: "hello"),
            CustomPreferenceEntry(domain: "com.vendor.app", key: "enabled", type: .boolean, stringValue: "true"),
            CustomPreferenceEntry(domain: "com.vendor.app", key: "count", type: .integer, stringValue: "42"),
            CustomPreferenceEntry(domain: "com.vendor.app", key: "list", type: .array, stringValue: "[\"a\",\"b\"]"),
            CustomPreferenceEntry(domain: "com.vendor.app", key: "config", type: .dictionary, stringValue: "{\"x\":1}")
        ]
        let payload = try generator.customPreferencesPayload(entries: entries, payloadIdentifierPrefix: "x")
        XCTAssertEqual(payload["PayloadType"] as? String, "com.apple.ManagedClient.preferences")
        XCTAssertNoThrow(try PlistValidator.validate(payload))
    }

    // MARK: - Combined profile export

    func testCombinedMobileconfigContainsAllPayloads() throws {
        let pppc = try generator.generatePPPCPayload(app: signedApp(), entries: [PPPCEntry(service: .camera, decision: .allow)], payloadIdentifierPrefix: "com.AKVERMA.example")
        let notifications = try generator.generateNotificationsPayload(app: signedApp(), settings: NotificationSettings(), payloadIdentifierPrefix: "com.AKVERMA.example")

        let combined = try generator.combineIntoMobileconfig(payloads: [pppc, notifications], organizationIdentifier: "com.AKVERMA.example.managedsettings", displayName: "Test Profile")
        XCTAssertEqual(combined["PayloadType"] as? String, "Configuration")
        let content = try XCTUnwrap(combined["PayloadContent"] as? [[String: Any]])
        XCTAssertEqual(content.count, 2)

        let xmlData = try generator.serializeToXML(combined)
        XCTAssertGreaterThan(xmlData.count, 0)
        let roundTrip = try PropertyListSerialization.propertyList(from: xmlData, options: [], format: nil) as? [String: Any]
        XCTAssertEqual(roundTrip?["PayloadType"] as? String, "Configuration")
    }

    func testCombinedMobileconfigRejectsEmptyPayloadList() {
        XCTAssertThrowsError(try generator.combineIntoMobileconfig(payloads: [], organizationIdentifier: "x", displayName: "Empty"))
    }

    // MARK: - macOS compatibility metadata presence

    func testEveryPPPCServiceDeclaresDisplayNameAndExplanation() {
        for service in PPPCService.allCases {
            XCTAssertFalse(service.displayName.isEmpty)
            XCTAssertFalse(service.explanation.isEmpty)
            XCTAssertFalse(service.tccServiceKey.isEmpty)
        }
    }
}
