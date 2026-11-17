import Foundation

/// A deliberately small, hand-verified catalog of vendor-documented managed
/// auto-update preferences. `ProfileGeneratorService` refuses to generate an
/// app-update payload for anything not listed here — see
/// `AppUpdatesTabView`'s "No verified managed auto-update preference is
/// available for this application" fallback. Do not add an entry without a
/// citable vendor reference; guessing a preference domain/key here would
/// silently produce a payload macOS ignores, which is worse than no payload.
enum AppUpdateCatalog {
    static let definitions: [AppUpdateDefinition] = [
        AppUpdateDefinition(
            matchingBundleIdentifiers: ["com.google.Chrome"],
            displayName: "Google Chrome",
            preferenceDomain: "com.google.Keystone.Agent",
            autoUpdateKey: "checkInterval",
            disableValue: .int(0),
            enableValue: .int(3600),
            valueType: .integer,
            sourceReference: "Google Chrome Enterprise help — \"Disable auto-update (Keystone) on macOS\": set com.google.Keystone.Agent checkInterval to 0 to stop update checks.",
            testedVersions: "Chrome 100–129 (Keystone-based updater, all Chrome versions prior to Chrome's 2024 migration off Keystone)"
        ),
        AppUpdateDefinition(
            matchingBundleIdentifiers: ["com.microsoft.edgemac", "com.microsoft.edgemac.beta", "com.microsoft.edgemac.dev"],
            displayName: "Microsoft Edge",
            preferenceDomain: "com.microsoft.edgeupdate",
            autoUpdateKey: "UpdateDefault",
            disableValue: .int(0),
            enableValue: .int(1),
            valueType: .integer,
            sourceReference: "Microsoft Edge for Mac policy documentation — com.microsoft.edgeupdate domain, UpdateDefault key (0 = updates disabled, 1 = always allow).",
            testedVersions: "Edge 100+ (Microsoft AutoUpdate/MAU-based updater)"
        )
    ]

    static func definition(forBundleIdentifier bundleID: String) -> AppUpdateDefinition? {
        definitions.first { $0.matchingBundleIdentifiers.contains(bundleID) }
    }
}
