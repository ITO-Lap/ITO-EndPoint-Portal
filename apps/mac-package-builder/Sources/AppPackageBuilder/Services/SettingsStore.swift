import Foundation
import SwiftUI

/// Non-sensitive user preferences. Backed by `AppStorage`/`UserDefaults`.
/// Never stores passwords, tokens, or notarization credentials — signing
/// identity is a Keychain-resident certificate reference (SHA-1/common
/// name), and the notarization "credential" is only a Keychain profile
/// *name* resolved by `notarytool` itself at submit time.
final class SettingsStore: ObservableObject {
    @AppStorage("defaultOutputDirectory") var defaultOutputDirectory: String = "~/Desktop/Packages"
    @AppStorage("defaultOrganizationIdentifier") var defaultOrganizationIdentifier: String = "com.VERMA"
    @AppStorage("defaultPackagingModeRaw") var defaultPackagingModeRaw: String = PackagingMode.enterprisePayload.rawValue
    @AppStorage("defaultSigningIdentitySHA1") var defaultSigningIdentitySHA1: String = ""
    @AppStorage("defaultMinimumMacOSVersion") var defaultMinimumMacOSVersion: String = "14.0"
    @AppStorage("logRetentionDays") var logRetentionDays: Int = 30
    @AppStorage("checkForApplicationUpdates") var checkForApplicationUpdates: Bool = true
    @AppStorage("endpointCentralServerHint") var endpointCentralServerHint: String = ""
    @AppStorage("notarizationKeychainProfile") var notarizationKeychainProfile: String = ""
    /// Opts into the optional, unofficial third-party `winget.run` discovery
    /// index for free-text name/publisher search in the "WinGet Packager
    /// (Local)" module. ON by default, with an opt-out in Settings. This index is used ONLY as a search
    /// convenience — it is never a source of installer URLs or SHA-256
    /// hashes, which always come from the official `microsoft/winget-pkgs`
    /// manifest fetch regardless of this setting.
    @AppStorage("enableWinGetRunDiscovery") var enableWinGetRunDiscovery: Bool = true

    var defaultPackagingMode: PackagingMode {
        PackagingMode(rawValue: defaultPackagingModeRaw) ?? .enterprisePayload
    }
}
