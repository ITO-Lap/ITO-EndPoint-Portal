import Foundation

// MARK: - Application signature (extracted, never invented)

/// Facts extracted from a real `.app` bundle's code signature and Info.plist.
/// Every field here comes from `codesign`/`PlistBuddy` output — nothing is a
/// user-typed guess, so a nil field means "not determined," not "unknown but
/// assumed fine."
struct AppSignatureInfo: Codable, Equatable {
    let appPath: String
    let appName: String
    let bundleIdentifier: String?
    let teamIdentifier: String?
    let codeRequirement: String?
    let executablePath: String?
    let isSigned: Bool
    let isNotarized: Bool
}

enum SettingStatus: String, Codable, CaseIterable {
    case supported = "Supported"
    case unsupported = "Unsupported"
    case requiresMDM = "Requires MDM"
    case requiresSupervision = "Requires Supervision"
    case userApprovalRequired = "User Approval Required"
    case vendorDocumentationRequired = "Vendor Documentation Required"
    case conflict = "Conflict"
}

// MARK: - PPPC (Privacy Preferences Policy Control)

enum PPPCService: String, CaseIterable, Codable, Identifiable {
    case accessibility, fullDiskAccess, appleEvents, camera, microphone
    case screenRecording, inputMonitoring, bluetooth, calendar, contacts, photos
    case desktopFolder, documentsFolder, downloadsFolder
    case networkVolumes, removableVolumes, administratorFiles

    var id: String { rawValue }

    /// The literal `Services.<Key>` dictionary key used inside a
    /// `com.apple.TCC.configuration-profile-policy` payload, per Apple's
    /// Configuration Profile Reference.
    var tccServiceKey: String {
        switch self {
        case .accessibility: return "Accessibility"
        case .fullDiskAccess: return "SystemPolicyAllFiles"
        case .appleEvents: return "AppleEvents"
        case .camera: return "Camera"
        case .microphone: return "Microphone"
        case .screenRecording: return "ScreenCapture"
        case .inputMonitoring: return "ListenEvent"
        case .bluetooth: return "BluetoothAlways"
        case .calendar: return "Calendar"
        case .contacts: return "AddressBook"
        case .photos: return "Photos"
        case .desktopFolder: return "SystemPolicyDesktopFolder"
        case .documentsFolder: return "SystemPolicyDocumentsFolder"
        case .downloadsFolder: return "SystemPolicyDownloadsFolder"
        case .networkVolumes: return "SystemPolicyNetworkVolumes"
        case .removableVolumes: return "SystemPolicyRemovableVolumes"
        case .administratorFiles: return "SystemPolicySysAdminFiles"
        }
    }

    var displayName: String {
        switch self {
        case .accessibility: return "Accessibility"
        case .fullDiskAccess: return "Full Disk Access"
        case .appleEvents: return "Apple Events"
        case .camera: return "Camera"
        case .microphone: return "Microphone"
        case .screenRecording: return "Screen Recording"
        case .inputMonitoring: return "Input Monitoring"
        case .bluetooth: return "Bluetooth"
        case .calendar: return "Calendar"
        case .contacts: return "Contacts"
        case .photos: return "Photos"
        case .desktopFolder: return "Desktop"
        case .documentsFolder: return "Documents"
        case .downloadsFolder: return "Downloads"
        case .networkVolumes: return "Network Volumes"
        case .removableVolumes: return "Removable Volumes"
        case .administratorFiles: return "Administrator Files"
        }
    }

    var explanation: String {
        switch self {
        case .accessibility: return "Controls the accessibility API, used to observe or control other applications."
        case .fullDiskAccess: return "Grants unrestricted read access to protected locations (Mail, Messages, Time Machine backups, etc.)."
        case .appleEvents: return "Allows this app to send Apple Events to another named application — requires a target identifier."
        case .camera: return "Controls access to the camera."
        case .microphone: return "Controls access to the microphone."
        case .screenRecording: return "Controls the ability to capture the screen or system audio."
        case .inputMonitoring: return "Controls the ability to monitor keyboard/mouse input system-wide."
        case .bluetooth: return "Controls access to paired Bluetooth peripherals."
        case .calendar: return "Controls access to Calendar data."
        case .contacts: return "Controls access to Contacts data."
        case .photos: return "Controls access to the Photos library."
        case .desktopFolder: return "Controls access to the user's Desktop folder."
        case .documentsFolder: return "Controls access to the user's Documents folder."
        case .downloadsFolder: return "Controls access to the user's Downloads folder."
        case .networkVolumes: return "Controls access to mounted network volumes."
        case .removableVolumes: return "Controls access to removable storage volumes."
        case .administratorFiles: return "Controls access to files owned by other users, typically requiring admin rights."
        }
    }

    /// `true` for the one TCC service that requires an additional target
    /// application identifier/requirement (`AEReceiverIdentifier` /
    /// `AEReceiverCodeRequirement`) rather than a bare Allow/Deny.
    var requiresTarget: Bool { self == .appleEvents }
}

enum PPPCDecision: String, Codable, CaseIterable {
    case allow = "Allow"
    case deny = "Deny"
}

struct PPPCEntry: Codable, Equatable, Identifiable {
    var id: String { service.rawValue }
    var service: PPPCService
    var decision: PPPCDecision?
    /// Required only for `.appleEvents`.
    var targetBundleIdentifier: String = ""
    var targetCodeRequirement: String = ""
}

// MARK: - Notifications

enum NotificationAlertStyle: String, Codable, CaseIterable, Identifiable {
    case none = "None"
    case banner = "Banner"
    case alert = "Alert"
    var id: String { rawValue }
}

struct NotificationSettings: Codable, Equatable {
    var allowNotifications: Bool = true
    var showInNotificationCenter: Bool = true
    var showOnLockScreen: Bool = false
    var playSounds: Bool = true
    var showBadges: Bool = true
    var alertStyle: NotificationAlertStyle = .banner
    var criticalAlertsEnabled: Bool = false
    var grouping: NotificationGrouping = .automatic
}

enum NotificationGrouping: String, Codable, CaseIterable, Identifiable {
    case automatic = "Automatic"
    case byApp = "By App"
    case off = "Off"
    var id: String { rawValue }

    /// Apple's `NotificationSettings` payload key `NotificationsEnabled` etc.
    /// use an integer `AlertType`; grouping maps to `Grouping` (0=automatic,
    /// 1=byApp, 2=off) per the Configuration Profile Reference.
    var payloadValue: Int {
        switch self {
        case .automatic: return 0
        case .byApp: return 1
        case .off: return 2
        }
    }
}

enum NotificationPreset: String, CaseIterable, Identifiable {
    case allowAll = "Allow All"
    case silent = "Silent"
    case disabled = "Disable Notifications"
    case custom = "Custom"
    var id: String { rawValue }

    var settings: NotificationSettings? {
        switch self {
        case .allowAll:
            return NotificationSettings(allowNotifications: true, showInNotificationCenter: true, showOnLockScreen: true, playSounds: true, showBadges: true, alertStyle: .alert, criticalAlertsEnabled: false, grouping: .automatic)
        case .silent:
            return NotificationSettings(allowNotifications: true, showInNotificationCenter: true, showOnLockScreen: false, playSounds: false, showBadges: true, alertStyle: .banner, criticalAlertsEnabled: false, grouping: .byApp)
        case .disabled:
            return NotificationSettings(allowNotifications: false, showInNotificationCenter: false, showOnLockScreen: false, playSounds: false, showBadges: false, alertStyle: .none, criticalAlertsEnabled: false, grouping: .off)
        case .custom:
            return nil
        }
    }
}

// MARK: - App updates

enum ThirdPartyUpdatePolicy: String, CaseIterable, Identifiable {
    case managedByVendor = "Managed by Vendor"
    case disableAutoUpdate = "Disable App Auto-Update"
    case enableAutoUpdate = "Enable App Auto-Update"
    case managedByMDMPackage = "Managed by MDM Package"
    case custom = "Custom"
    var id: String { rawValue }
}

/// One vendor's *documented* managed auto-update preference. Only ship
/// entries here that are backed by a real, citable vendor reference —
/// `ProfileGeneratorService` refuses to emit a payload for anything not in
/// this catalog.
struct AppUpdateDefinition: Identifiable {
    var id: String { preferenceDomain }
    let matchingBundleIdentifiers: [String]
    let displayName: String
    let preferenceDomain: String
    let autoUpdateKey: String
    let disableValue: PlistValue
    let enableValue: PlistValue
    let valueType: CustomPreferenceType
    let sourceReference: String
    let testedVersions: String
}

enum AppleSoftwareUpdatePreset: String, CaseIterable, Identifiable {
    case recommended = "Recommended"
    case securityFocused = "Security Focused"
    case minimalPrompts = "Minimal Prompts"
    case custom = "Custom"
    var id: String { rawValue }
}

struct AppleSoftwareUpdateSettings: Codable, Equatable {
    var automaticCheckEnabled: Bool = true
    var automaticDownload: Bool = true
    var criticalUpdateInstall: Bool = true
    var configDataInstall: Bool = true
    var automaticAppInstallation: Bool = false
    var automaticOSInstallation: Bool = false
    var allowPreReleaseInstallation: Bool = false
}

// MARK: - System / Network extensions

enum SystemExtensionPointKind: String, Codable {
    case networkExtension = "com.apple.system_extension.network_extension"
    case endpointSecurity = "com.apple.system_extension.endpoint_security"
    case driverExtension = "com.apple.system_extension.driver_extension"
    case unknown

    var displayName: String {
        switch self {
        case .networkExtension: return "Network Extension"
        case .endpointSecurity: return "Endpoint Security Extension"
        case .driverExtension: return "DriverKit Extension"
        case .unknown: return "System Extension"
        }
    }
}

enum NetworkExtensionProviderKind: String, Codable {
    case contentFilter = "Content Filter"
    case dnsProxy = "DNS Proxy"
    case packetTunnel = "Packet Tunnel (VPN)"
    case appProxy = "App Proxy"
    case unknown = "Not determined from provider class"
}

struct DetectedSystemExtension: Codable, Equatable, Identifiable {
    var id: String { identifier }
    let identifier: String
    let pointKind: SystemExtensionPointKind
    let networkProviderKind: NetworkExtensionProviderKind?
    let teamIdentifier: String?
    let bundlePath: String

    enum CodingKeys: String, CodingKey {
        case identifier, pointKind, networkProviderKind, teamIdentifier, bundlePath
    }
}

enum SystemExtensionApprovalState: String, Codable, CaseIterable, Identifiable {
    case allow = "Allow"
    case notConfigured = "Not Configured"
    var id: String { rawValue }
}

// MARK: - Background items

enum BackgroundItemKind: String, Codable {
    case launchAgent = "LaunchAgent"
    case launchDaemon = "LaunchDaemon"
    case loginItem = "Login Item"
    case privilegedHelper = "Privileged Helper Tool"
}

struct DetectedBackgroundItem: Codable, Equatable, Identifiable {
    var id: String { "\(kind.rawValue):\(identifier)" }
    let kind: BackgroundItemKind
    let identifier: String
    let path: String
    /// System/security-critical items (e.g. Apple-signed helpers) that this
    /// tool will never offer to silently disable.
    let isRequiredForOperation: Bool
}

enum ManagedLoginItemRuleType: String, Codable, CaseIterable {
    case bundleIdentifier = "BundleIdentifier"
    case identifier = "Identifier"
    case teamIdentifier = "TeamIdentifier"
}

// MARK: - Custom preferences

enum CustomPreferenceType: String, Codable, CaseIterable, Identifiable {
    case string = "String"
    case boolean = "Boolean"
    case integer = "Integer"
    case array = "Array"
    case dictionary = "Dictionary"
    var id: String { rawValue }
}

enum CustomPreferenceScope: String, Codable, CaseIterable, Identifiable {
    case user = "User"
    case system = "System"
    var id: String { rawValue }
}

struct CustomPreferenceEntry: Codable, Equatable, Identifiable {
    var id = UUID()
    var domain: String = ""
    var key: String = ""
    var type: CustomPreferenceType = .string
    var stringValue: String = ""
    var scope: CustomPreferenceScope = .user
    var documentationReference: String = ""
}

/// A type-erased plist-safe value used only inside the (small, hand-curated)
/// `AppUpdateDefinition` catalog — never constructed from free-form user
/// input, unlike `CustomPreferenceEntry` which goes through `PlistValueParser`.
enum PlistValue: Equatable {
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)

    var asPropertyListObject: Any {
        switch self {
        case .bool(let v): return v
        case .int(let v): return v
        case .double(let v): return v
        case .string(let v): return v
        }
    }
}
