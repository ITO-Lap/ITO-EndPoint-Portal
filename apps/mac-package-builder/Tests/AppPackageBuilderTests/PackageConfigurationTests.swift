import XCTest
@testable import AppPackageBuilder

final class PackageConfigurationTests: XCTestCase {

    func testDraftFailsValidationUntilFieldsAreFilled() {
        let draft = PackageConfiguration.draft()
        XCTAssertThrowsError(try draft.validateStrictFields())
    }

    func testFullyConfiguredPasses() throws {
        var config = PackageConfiguration.draft()
        config.homebrewToken = "jq"
        config.packageIdentifier = "com.AKVERMA.jq"
        config.packageVersion = "1.0"
        config.outputDirectory = NSTemporaryDirectory()
        XCTAssertNoThrow(try config.validateStrictFields())
    }

    func testLatestRequiredVersionSkipsVersionValidation() throws {
        var config = PackageConfiguration.draft()
        config.homebrewToken = "jq"
        config.packageIdentifier = "com.AKVERMA.jq"
        config.outputDirectory = NSTemporaryDirectory()
        config.requiredVersion = "latest"
        XCTAssertNoThrow(try config.validateStrictFields())
    }

    /// The "state transitions" a build result can be in — success only when the
    /// installed version actually satisfies the request, per the spec's rule
    /// that "if the requested version is already installed, return success" and
    /// otherwise upgrade-or-fail based on `upgradeExisting`.
    func testStateTransitionLogic() {
        func decide(installed: String, required: String, upgradeAllowed: Bool) -> String {
            if required == "latest" { return "success" }
            switch AppVersionComparator.compare(installed, required) {
            case .same, .descending: return "success"
            case .ascending: return upgradeAllowed ? "upgrade" : "fail"
            }
        }

        XCTAssertEqual(decide(installed: "1.0", required: "1.0", upgradeAllowed: false), "success")
        XCTAssertEqual(decide(installed: "1.1", required: "1.0", upgradeAllowed: false), "success")
        XCTAssertEqual(decide(installed: "1.0", required: "1.1", upgradeAllowed: true), "upgrade")
        XCTAssertEqual(decide(installed: "1.0", required: "1.1", upgradeAllowed: false), "fail")
    }
}
