import XCTest
@testable import AppPackageBuilder

/// Round-trip tests against the real `KeychainStore` (Security.framework),
/// not a mock — safe to run in-process against the real macOS Keychain
/// because every test uses a distinct service/account pair scoped to this
/// test file and cleans up in `tearDown`, so it can never collide with the
/// app's real `windows-build-agent-token` entry or leave residue behind.
final class KeychainStoreTests: XCTestCase {

    /// A service name distinct from the app's real
    /// `"com.apppackagebuilder.windowsAgent"` service, so these tests can
    /// never read, overwrite, or leave behind the user's real stored token.
    private let testService = "com.apppackagebuilder.windowsAgent.tests"
    private var testAccount = ""

    private var store: KeychainStore!

    override func setUp() {
        super.setUp()
        testAccount = "keychain-store-tests-account-\(UUID().uuidString)"
        store = KeychainStore(service: testService)
    }

    override func tearDown() {
        try? store.deleteSecret(account: testAccount)
        store = nil
        super.tearDown()
    }

    func testSetThenGetRoundTripsTheSecret() throws {
        try store.setSecret("super-secret-token-value", account: testAccount)

        let retrieved = try store.getSecret(account: testAccount)

        XCTAssertEqual(retrieved, "super-secret-token-value")
    }

    func testSetTwiceUpdatesRatherThanDuplicating() throws {
        try store.setSecret("first-value", account: testAccount)
        try store.setSecret("second-value", account: testAccount)

        let retrieved = try store.getSecret(account: testAccount)

        XCTAssertEqual(retrieved, "second-value")
    }

    func testDeleteRemovesTheSecret() throws {
        try store.setSecret("to-be-deleted", account: testAccount)

        try store.deleteSecret(account: testAccount)

        let retrieved = try store.getSecret(account: testAccount)
        XCTAssertNil(retrieved)
    }

    func testDeleteOfNeverSetAccountDoesNotThrow() {
        // errSecItemNotFound is treated as a benign no-op by `deleteSecret`,
        // not surfaced as an error — deleting something that was never there
        // is not a failure condition.
        XCTAssertNoThrow(try store.deleteSecret(account: "never-set-account-\(UUID().uuidString)"))
    }

    func testGetForNeverSetAccountReturnsNilRatherThanThrowing() throws {
        let retrieved = try store.getSecret(account: "never-set-account-\(UUID().uuidString)")

        XCTAssertNil(retrieved)
    }

    func testDifferentAccountsUnderSameServiceDoNotCollide() throws {
        let otherAccount = "keychain-store-tests-account-2"
        defer { try? store.deleteSecret(account: otherAccount) }

        try store.setSecret("value-for-account-1", account: testAccount)
        try store.setSecret("value-for-account-2", account: otherAccount)

        XCTAssertEqual(try store.getSecret(account: testAccount), "value-for-account-1")
        XCTAssertEqual(try store.getSecret(account: otherAccount), "value-for-account-2")
    }
}
