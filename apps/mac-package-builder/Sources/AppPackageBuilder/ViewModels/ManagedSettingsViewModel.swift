import Foundation
import SwiftUI
import AppKit

enum ManagedSettingsTab: String, CaseIterable, Identifiable {
    case privacy = "Privacy (PPPC)"
    case notifications = "Notifications"
    case appUpdates = "App Updates"
    case systemExtensions = "System Extensions"
    case networkExtensions = "Network Extensions"
    case backgroundItems = "Background Items"
    case customPreferences = "Custom Preferences"
    case review = "Review & Export"
    var id: String { rawValue }
}

enum PPPCPreset: String, CaseIterable, Identifiable {
    case recommended = "Recommended"
    case securityFocused = "Security Focused"
    case minimalPrompts = "Minimal Prompts"
    case custom = "Custom"
    var id: String { rawValue }
}

@MainActor
final class ManagedSettingsViewModel: ObservableObject {
    @Published var selectedTab: ManagedSettingsTab = .privacy
    @Published var appSignature: AppSignatureInfo?
    @Published var isInspecting = false
    @Published var inspectionError: String?

    @Published var pppcEntries: [PPPCEntry] = PPPCService.allCases.map { PPPCEntry(service: $0) }
    @Published var notificationSettings = NotificationSettings()
    @Published var notificationPreset: NotificationPreset = .custom
    @Published var thirdPartyUpdatePolicy: ThirdPartyUpdatePolicy = .managedByVendor
    @Published var softwareUpdateSettings = AppleSoftwareUpdateSettings()
    @Published var detectedSystemExtensions: [DetectedSystemExtension] = []
    @Published var systemExtensionApprovals: [String: SystemExtensionApprovalState] = [:]
    @Published var allowUserOverridesForExtensions = false
    @Published var detectedBackgroundItems: [DetectedBackgroundItem] = []
    @Published var managedLoginItemSelections: Set<String> = []
    @Published var customPreferences: [CustomPreferenceEntry] = []

    @Published var lastGeneratedProfileXML: String?
    @Published var lastExportError: String?
    @Published var lastExportedURL: URL?

    private let inspectionService: AppInspectionServicing
    let generator = ProfileGeneratorService()
    let organizationIdentifierPrefix: String

    init(inspectionService: AppInspectionServicing = AppInspectionService(), organizationIdentifierPrefix: String = "com.AKVERMA.managedsettings") {
        self.inspectionService = inspectionService
        self.organizationIdentifierPrefix = organizationIdentifierPrefix
    }

    /// Derives the same kind of short, filesystem-safe app folder name New
    /// Package builds use (e.g. "slack", "opera") from the bundle
    /// identifier's last component, so Managed Settings exports land next to
    /// a matching package build under `<outputDirectory>/<appName>` — never
    /// invented, just the trailing label of a real, extracted bundle ID.
    var appFolderName: String {
        guard let bundleID = appSignature?.bundleIdentifier, let last = bundleID.split(separator: ".").last else {
            return (appSignature?.appName ?? "app").lowercased().replacingOccurrences(of: " ", with: "-")
        }
        return last.lowercased()
    }

    var payloadIdentifierPrefix: String {
        let token = appSignature?.bundleIdentifier ?? "unknown"
        return "\(organizationIdentifierPrefix).\(token)"
    }

    func chooseApplication() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.application]
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = false
        panel.directoryURL = URL(fileURLWithPath: "/Applications")
        guard panel.runModal() == .OK, let url = panel.url else { return }
        Task { await inspect(appPath: url) }
    }

    func inspect(appPath: URL) async {
        isInspecting = true
        inspectionError = nil
        defer { isInspecting = false }
        do {
            let signature = try await inspectionService.inspectSignature(appPath: appPath)
            appSignature = signature
            detectedSystemExtensions = await inspectionService.detectSystemExtensions(appPath: appPath)
            detectedBackgroundItems = await inspectionService.detectBackgroundItems(appPath: appPath)
            pppcEntries = PPPCService.allCases.map { PPPCEntry(service: $0) }
            systemExtensionApprovals = [:]
            managedLoginItemSelections = []
        } catch {
            inspectionError = error.localizedDescription
            appSignature = nil
        }
    }

    // MARK: - Presets

    func applyPPPCPreset(_ preset: PPPCPreset) {
        switch preset {
        case .recommended:
            pppcEntries = PPPCService.allCases.map { PPPCEntry(service: $0, decision: nil) }
        case .securityFocused:
            pppcEntries = PPPCService.allCases.map { service in
                let decision: PPPCDecision? = [.accessibility, .fullDiskAccess, .inputMonitoring, .screenRecording].contains(service) ? .deny : nil
                return PPPCEntry(service: service, decision: decision)
            }
        case .minimalPrompts:
            pppcEntries = PPPCService.allCases.map { PPPCEntry(service: $0, decision: .allow) }
        case .custom:
            break
        }
    }

    func applyNotificationPreset(_ preset: NotificationPreset) {
        notificationPreset = preset
        if let settings = preset.settings {
            notificationSettings = settings
        }
    }

    // MARK: - Conflict detection

    var pppcConflicts: [PPPCConflict] {
        generator.detectConflicts(in: pppcEntries)
    }

    // MARK: - Payload building (Review & Export)

    struct GeneratedPayload: Identifiable {
        let id = UUID()
        let name: String
        var result: Result<[String: Any], Error>
    }

    func buildAllPayloads() -> [GeneratedPayload] {
        guard let app = appSignature else { return [] }
        var payloads: [GeneratedPayload] = []

        let activePPPC = pppcEntries.filter { $0.decision != nil }
        if !activePPPC.isEmpty {
            payloads.append(GeneratedPayload(name: "PPPC", result: Result { try generator.generatePPPCPayload(app: app, entries: activePPPC, payloadIdentifierPrefix: payloadIdentifierPrefix) }))
        }

        payloads.append(GeneratedPayload(name: "Notifications", result: Result { try generator.generateNotificationsPayload(app: app, settings: notificationSettings, payloadIdentifierPrefix: payloadIdentifierPrefix) }))

        if thirdPartyUpdatePolicy == .disableAutoUpdate || thirdPartyUpdatePolicy == .enableAutoUpdate {
            payloads.append(GeneratedPayload(name: "App Updates (3rd-party)", result: Result { try generator.generateThirdPartyUpdatePayload(app: app, policy: thirdPartyUpdatePolicy, payloadIdentifierPrefix: payloadIdentifierPrefix) }))
        }
        payloads.append(GeneratedPayload(name: "macOS Software Update", result: .success(generator.generateAppleSoftwareUpdatePayload(settings: softwareUpdateSettings, payloadIdentifierPrefix: payloadIdentifierPrefix))))

        let approvedExtensions = detectedSystemExtensions.filter { systemExtensionApprovals[$0.identifier] == .allow }
        if !approvedExtensions.isEmpty {
            payloads.append(GeneratedPayload(name: "System/Network Extensions", result: Result { try generator.generateSystemExtensionPolicyPayload(extensions: approvedExtensions, allowUserOverrides: allowUserOverridesForExtensions, payloadIdentifierPrefix: payloadIdentifierPrefix) }))
        }

        let selectedItems = detectedBackgroundItems.filter { managedLoginItemSelections.contains($0.id) }
        if !selectedItems.isEmpty {
            let rules = selectedItems.map { (type: ManagedLoginItemRuleType.identifier, value: $0.identifier, comment: "\($0.kind.rawValue) detected from \(appSignature?.appName ?? "application")") }
            payloads.append(GeneratedPayload(name: "Background Items (Managed Login Items)", result: Result { try generator.generateManagedLoginItemsPayload(rules: rules, payloadIdentifierPrefix: payloadIdentifierPrefix) }))
        }

        if !customPreferences.isEmpty {
            payloads.append(GeneratedPayload(name: "Custom Preferences", result: Result { try generator.customPreferencesPayload(entries: customPreferences, payloadIdentifierPrefix: payloadIdentifierPrefix) }))
        }

        return payloads
    }

    func generateCombinedMobileconfig() -> Result<Data, Error> {
        let payloads = buildAllPayloads()
        let successful = payloads.compactMap { try? $0.result.get() }
        guard successful.count == payloads.count, !successful.isEmpty else {
            return .failure(ProfileGeneratorError.invalidPlist("Resolve all payload errors before exporting the combined profile."))
        }
        return Result {
            let combined = try generator.combineIntoMobileconfig(payloads: successful, organizationIdentifier: payloadIdentifierPrefix, displayName: "Managed Settings: \(appSignature?.appName ?? "Application")")
            return try generator.serializeToXML(combined)
        }
    }

    func exportCombinedProfile(to directory: URL) {
        lastExportError = nil
        switch generateCombinedMobileconfig() {
        case .failure(let error):
            lastExportError = error.localizedDescription
        case .success(let data):
            let fileName = "\(appSignature?.bundleIdentifier ?? "managed-settings")-ManagedSettings.mobileconfig"
            let destination = directory.appendingPathComponent(fileName)
            if FileManager.default.fileExists(atPath: destination.path) {
                lastExportError = "\(fileName) already exists at that location. Choose a different location or remove the existing file first."
                return
            }
            do {
                try data.write(to: destination)
                lastExportedURL = destination
                lastGeneratedProfileXML = String(data: data, encoding: .utf8)
            } catch {
                lastExportError = error.localizedDescription
            }
        }
    }

    func exportIndividualPayload(_ payload: GeneratedPayload, to directory: URL) {
        lastExportError = nil
        guard let dict = try? payload.result.get() else {
            lastExportError = "Cannot export \(payload.name): it has a validation error."
            return
        }
        do {
            let data = try generator.serializeToXML(dict)
            let safeName = payload.name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: " ", with: "-")
            let destination = directory.appendingPathComponent("\(appSignature?.bundleIdentifier ?? "app")-\(safeName).plist")
            if FileManager.default.fileExists(atPath: destination.path) {
                lastExportError = "\(destination.lastPathComponent) already exists. Choose a different location or remove it first."
                return
            }
            try data.write(to: destination)
            lastExportedURL = destination
        } catch {
            lastExportError = error.localizedDescription
        }
    }
}
