import Foundation

enum ProfileGeneratorError: LocalizedError {
    case missingBundleIdentifier
    case missingTeamIdentifier
    case missingCodeRequirement
    case noVerifiedUpdatePreference(bundleIdentifier: String)
    case invalidPlist(String)
    case appleEventsTargetMissing

    var errorDescription: String? {
        switch self {
        case .missingBundleIdentifier:
            return "This application's bundle identifier could not be extracted from its signature. Select a valid, signed application."
        case .missingTeamIdentifier:
            return "This application is not signed with a Developer ID / Team, so no Team Identifier is available for this payload."
        case .missingCodeRequirement:
            return "This application's designated code requirement could not be extracted. It may be unsigned or ad-hoc signed."
        case .noVerifiedUpdatePreference(let bundleID):
            return "No verified managed auto-update preference is available for \(bundleID)."
        case .invalidPlist(let reason):
            return "Generated property list is invalid: \(reason)"
        case .appleEventsTargetMissing:
            return "Apple Events requires a target application bundle identifier and code requirement."
        }
    }
}

struct PPPCConflict: Equatable {
    let service: PPPCService
    let decisions: [PPPCDecision]
}

/// Produces the real, distinct macOS configuration-profile payload
/// dictionaries for each Managed Settings tab — never one dumping ground.
/// Every generator validates its required inputs (bundle ID / Team ID / code
/// requirement / a catalog match) and throws rather than emitting a payload
/// built on a guessed value.
final class ProfileGeneratorService {

    // MARK: - PPPC

    func detectConflicts(in entries: [PPPCEntry]) -> [PPPCConflict] {
        let grouped = Dictionary(grouping: entries, by: \.service)
        return grouped.compactMap { service, group in
            let decisions = Set(group.compactMap(\.decision))
            guard decisions.count > 1 else { return nil }
            return PPPCConflict(service: service, decisions: group.compactMap(\.decision))
        }
    }

    func generatePPPCPayload(app: AppSignatureInfo, entries: [PPPCEntry], payloadIdentifierPrefix: String) throws -> [String: Any] {
        guard let bundleID = app.bundleIdentifier, !bundleID.isEmpty else {
            throw ProfileGeneratorError.missingBundleIdentifier
        }
        guard let codeRequirement = app.codeRequirement, !codeRequirement.isEmpty else {
            throw ProfileGeneratorError.missingCodeRequirement
        }
        guard detectConflicts(in: entries).isEmpty else {
            throw ProfileGeneratorError.invalidPlist("Conflicting decisions exist for the same service; resolve conflicts before exporting.")
        }

        var services: [String: [[String: Any]]] = [:]
        for entry in entries {
            guard let decision = entry.decision else { continue }
            var rule: [String: Any] = [
                "Identifier": bundleID,
                "IdentifierType": "bundleID",
                "CodeRequirement": codeRequirement,
                "Allowed": decision == .allow,
                "StaticCode": false
            ]
            if entry.service.requiresTarget {
                guard !entry.targetBundleIdentifier.isEmpty, !entry.targetCodeRequirement.isEmpty else {
                    throw ProfileGeneratorError.appleEventsTargetMissing
                }
                rule["AEReceiverIdentifier"] = entry.targetBundleIdentifier
                rule["AEReceiverCodeRequirement"] = entry.targetCodeRequirement
            }
            services[entry.service.tccServiceKey, default: []].append(rule)
        }

        return [
            "PayloadType": "com.apple.TCC.configuration-profile-policy",
            "PayloadIdentifier": "\(payloadIdentifierPrefix).pppc",
            "PayloadUUID": UUID().uuidString,
            "PayloadDisplayName": "Privacy Preferences: \(app.appName)",
            "PayloadVersion": 1,
            "PayloadEnabled": true,
            "Services": services
        ]
    }

    // MARK: - Notifications

    func generateNotificationsPayload(app: AppSignatureInfo, settings: NotificationSettings, payloadIdentifierPrefix: String) throws -> [String: Any] {
        guard let bundleID = app.bundleIdentifier, !bundleID.isEmpty else {
            throw ProfileGeneratorError.missingBundleIdentifier
        }
        let entry: [String: Any] = [
            "BundleIdentifier": bundleID,
            "NotificationsEnabled": settings.allowNotifications,
            "ShowInNotificationCenter": settings.showInNotificationCenter,
            "ShowInLockScreen": settings.showOnLockScreen,
            "SoundsEnabled": settings.playSounds,
            "BadgesEnabled": settings.showBadges,
            "AlertType": alertTypeValue(settings.alertStyle),
            "Grouping": settings.grouping.payloadValue,
            "CriticalAlertEnabled": settings.criticalAlertsEnabled
        ]
        return [
            "PayloadType": "com.apple.notificationsettings",
            "PayloadIdentifier": "\(payloadIdentifierPrefix).notifications",
            "PayloadUUID": UUID().uuidString,
            "PayloadDisplayName": "Notifications: \(app.appName)",
            "PayloadVersion": 1,
            "PayloadEnabled": true,
            "NotificationSettings": [entry]
        ]
    }

    private func alertTypeValue(_ style: NotificationAlertStyle) -> Int {
        switch style {
        case .none: return 0
        case .banner: return 1
        case .alert: return 2
        }
    }

    // MARK: - App updates

    func generateAppleSoftwareUpdatePayload(settings: AppleSoftwareUpdateSettings, payloadIdentifierPrefix: String) -> [String: Any] {
        [
            "PayloadType": "com.apple.SoftwareUpdate",
            "PayloadIdentifier": "\(payloadIdentifierPrefix).softwareupdate",
            "PayloadUUID": UUID().uuidString,
            "PayloadDisplayName": "macOS Software Update",
            "PayloadVersion": 1,
            "PayloadEnabled": true,
            "AutomaticCheckEnabled": settings.automaticCheckEnabled,
            "AutomaticDownload": settings.automaticDownload,
            "CriticalUpdateInstall": settings.criticalUpdateInstall,
            "ConfigDataInstall": settings.configDataInstall,
            "AutomaticAppInstallation": settings.automaticAppInstallation,
            "AutomaticOSInstallation": settings.automaticOSInstallation,
            "AllowPreReleaseInstallation": settings.allowPreReleaseInstallation
        ]
    }

    /// Only ever emits a payload for a bundle ID present in `AppUpdateCatalog`
    /// — throws `.noVerifiedUpdatePreference` otherwise, matching the UI's
    /// required fallback message.
    func generateThirdPartyUpdatePayload(app: AppSignatureInfo, policy: ThirdPartyUpdatePolicy, payloadIdentifierPrefix: String) throws -> [String: Any] {
        guard let bundleID = app.bundleIdentifier else { throw ProfileGeneratorError.missingBundleIdentifier }
        guard let definition = AppUpdateCatalog.definition(forBundleIdentifier: bundleID) else {
            throw ProfileGeneratorError.noVerifiedUpdatePreference(bundleIdentifier: bundleID)
        }
        let value: PlistValue
        switch policy {
        case .disableAutoUpdate: value = definition.disableValue
        case .enableAutoUpdate: value = definition.enableValue
        case .managedByVendor, .managedByMDMPackage, .custom:
            // These policies intentionally generate no preference payload:
            // "managed by vendor"/"by MDM package" means this tool should not
            // fight the vendor's own mechanism, and "custom" is handled via
            // the Custom Preferences tab instead.
            throw ProfileGeneratorError.noVerifiedUpdatePreference(bundleIdentifier: bundleID)
        }
        return try customPreferencesPayload(
            entries: [CustomPreferenceEntry(domain: definition.preferenceDomain, key: definition.autoUpdateKey, type: definition.valueType, stringValue: "\(value.asPropertyListObject)", scope: .user, documentationReference: definition.sourceReference)],
            payloadIdentifierPrefix: payloadIdentifierPrefix,
            displayName: "App Update: \(definition.displayName)"
        )
    }

    // MARK: - System / Network extensions

    /// Both System Extensions and Network Extensions are approved through the
    /// same `com.apple.system-extension-policy` payload on modern macOS —
    /// NetworkExtension providers (filters, DNS proxies, VPN, app proxies)
    /// *are* system extensions. This app still presents them as separate
    /// tabs for clarity, but does not invent a second, nonexistent payload
    /// type to keep that separation at the XML level.
    func generateSystemExtensionPolicyPayload(extensions: [DetectedSystemExtension], allowUserOverrides: Bool, payloadIdentifierPrefix: String) throws -> [String: Any] {
        guard !extensions.isEmpty else {
            throw ProfileGeneratorError.invalidPlist("No system/network extensions were detected to approve.")
        }
        var allowedByTeam: [String: [String]] = [:]
        for ext in extensions {
            guard let team = ext.teamIdentifier, !team.isEmpty else {
                throw ProfileGeneratorError.missingTeamIdentifier
            }
            allowedByTeam[team, default: []].append(ext.identifier)
        }
        return [
            "PayloadType": "com.apple.system-extension-policy",
            "PayloadIdentifier": "\(payloadIdentifierPrefix).systemextensions",
            "PayloadUUID": UUID().uuidString,
            "PayloadDisplayName": "Allowed System Extensions",
            "PayloadVersion": 1,
            "PayloadEnabled": true,
            "AllowedSystemExtensions": allowedByTeam,
            "AllowUserOverrides": allowUserOverrides
        ]
    }

    // MARK: - Background items (Managed Login Items)

    func generateManagedLoginItemsPayload(rules: [(type: ManagedLoginItemRuleType, value: String, comment: String)], payloadIdentifierPrefix: String) throws -> [String: Any] {
        guard !rules.isEmpty else {
            throw ProfileGeneratorError.invalidPlist("No login item rules to include.")
        }
        let ruleDicts: [[String: Any]] = rules.map {
            var dict: [String: Any] = ["RuleType": $0.type.rawValue, "RuleValue": $0.value]
            if !$0.comment.isEmpty { dict["Comment"] = $0.comment }
            return dict
        }
        return [
            "PayloadType": "com.apple.servicemanagement.managed-login-items",
            "PayloadIdentifier": "\(payloadIdentifierPrefix).loginitems",
            "PayloadUUID": UUID().uuidString,
            "PayloadDisplayName": "Managed Login Items",
            "PayloadVersion": 1,
            "PayloadEnabled": true,
            "Rules": ruleDicts
        ]
    }

    // MARK: - Custom preferences

    func customPreferencesPayload(entries: [CustomPreferenceEntry], payloadIdentifierPrefix: String, displayName: String = "Custom Preferences") throws -> [String: Any] {
        guard !entries.isEmpty else {
            throw ProfileGeneratorError.invalidPlist("No custom preference entries to include.")
        }
        var content: [String: Any] = [:]
        for entry in entries {
            guard !entry.domain.isEmpty, !entry.key.isEmpty else {
                throw ProfileGeneratorError.invalidPlist("Every custom preference needs a domain and a key.")
            }
            let value = try PlistValueParser.parse(entry.stringValue, as: entry.type)
            var domainDict = content[entry.domain] as? [String: Any] ?? [:]
            var forcedArray = domainDict["Forced"] as? [[String: Any]] ?? []
            var settings = (forcedArray.first?["mcx_preference_settings"] as? [String: Any]) ?? [:]
            settings[entry.key] = value
            if forcedArray.isEmpty {
                forcedArray = [["mcx_preference_settings": settings]]
            } else {
                forcedArray[0] = ["mcx_preference_settings": settings]
            }
            domainDict["Forced"] = forcedArray
            content[entry.domain] = domainDict
        }
        return [
            "PayloadType": "com.apple.ManagedClient.preferences",
            "PayloadIdentifier": "\(payloadIdentifierPrefix).custompreferences",
            "PayloadUUID": UUID().uuidString,
            "PayloadDisplayName": displayName,
            "PayloadVersion": 1,
            "PayloadEnabled": true,
            "PayloadContent": content
        ]
    }

    // MARK: - Combine + validate

    func combineIntoMobileconfig(payloads: [[String: Any]], organizationIdentifier: String, displayName: String) throws -> [String: Any] {
        guard !payloads.isEmpty else {
            throw ProfileGeneratorError.invalidPlist("No payloads selected to export.")
        }
        let profile: [String: Any] = [
            "PayloadType": "Configuration",
            "PayloadIdentifier": organizationIdentifier,
            "PayloadUUID": UUID().uuidString,
            "PayloadDisplayName": displayName,
            "PayloadDescription": "Generated by App Package Builder — Managed Settings.",
            "PayloadVersion": 1,
            "PayloadRemovalDisallowed": false,
            "PayloadContent": payloads
        ]
        try PlistValidator.validate(profile)
        return profile
    }

    func serializeToXML(_ plist: [String: Any]) throws -> Data {
        try PlistValidator.validate(plist)
        return try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
    }
}

/// Round-trips a plist dictionary through `PropertyListSerialization` so a
/// malformed value (e.g. a type `PropertyListSerialization` can't represent)
/// is caught before it's written to disk or presented as "ready to export."
enum PlistValidator {
    static func validate(_ plist: [String: Any]) throws {
        guard PropertyListSerialization.propertyList(plist, isValidFor: .xml) else {
            throw ProfileGeneratorError.invalidPlist("One or more values are not representable in a property list (only String, Number, Bool, Array, Dictionary, Date, and Data are supported).")
        }
        _ = try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
    }
}

/// Parses a `CustomPreferenceEntry`'s free-form string into the plist value
/// matching its declared type — the one place in this feature where a value
/// genuinely comes from open admin input, so it's validated strictly rather
/// than trusted.
enum PlistValueParser {
    enum ParseError: LocalizedError {
        case invalidBoolean(String)
        case invalidInteger(String)
        case invalidJSON(String, underlying: String)
        case wrongJSONShape(String)

        var errorDescription: String? {
            switch self {
            case .invalidBoolean(let v): return "\"\(v)\" is not a valid boolean (use true/false)."
            case .invalidInteger(let v): return "\"\(v)\" is not a valid integer."
            case .invalidJSON(let kind, let underlying): return "Value is not valid JSON for a \(kind): \(underlying)"
            case .wrongJSONShape(let kind): return "Value must be a JSON \(kind)."
            }
        }
    }

    static func parse(_ raw: String, as type: CustomPreferenceType) throws -> Any {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        switch type {
        case .string:
            return raw
        case .boolean:
            switch trimmed.lowercased() {
            case "true", "1", "yes": return true
            case "false", "0", "no": return false
            default: throw ParseError.invalidBoolean(raw)
            }
        case .integer:
            guard let intValue = Int(trimmed) else { throw ParseError.invalidInteger(raw) }
            return intValue
        case .array:
            guard let data = trimmed.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data), let array = json as? [Any] else {
                throw ParseError.wrongJSONShape("array, e.g. [\"a\", \"b\"]")
            }
            return array
        case .dictionary:
            guard let data = trimmed.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data), let dict = json as? [String: Any] else {
                throw ParseError.wrongJSONShape("object, e.g. {\"key\": \"value\"}")
            }
            return dict
        }
    }
}
