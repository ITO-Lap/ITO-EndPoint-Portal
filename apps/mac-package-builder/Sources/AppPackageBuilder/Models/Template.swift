import Foundation

/// A reusable, saved package configuration. Templates intentionally reuse
/// `PackageConfiguration` (which never holds passwords/tokens/notarization
/// secrets — `notarizationKeychainProfile` is a Keychain profile *name*,
/// not a credential) so saving/loading a template is a pure data copy.
struct PackageTemplate: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var name: String
    var summary: String
    var configuration: PackageConfiguration
    var createdAt: Date = Date()

    /// Built-in samples are settings *shapes*, never a specific app — each
    /// leaves `applicationName`/`homebrewToken`/`packageIdentifier` blank
    /// (`.draft()`'s empty defaults) so "Use in New Package" pre-fills only
    /// the reusable configuration, then lets you search for whatever app you
    /// actually need. A sample that hardcoded e.g. "visual-studio-code" would
    /// silently load VS Code's identifier no matter what you meant to package.
    static func builtInSamples() -> [PackageTemplate] {
        [
            PackageTemplate(
                name: "Standard Cask Application",
                summary: "A typical GUI .app distributed as a Homebrew cask, packaged offline (Enterprise Payload).",
                configuration: {
                    var c = PackageConfiguration.draft()
                    c.packageKind = .cask
                    c.packagingMode = .enterprisePayload
                    c.generateUninstaller = true
                    c.createDetectionScript = true
                    return c
                }()
            ),
            PackageTemplate(
                name: "Command-Line Formula",
                summary: "A CLI tool installed via a Homebrew formula, no background service.",
                configuration: {
                    var c = PackageConfiguration.draft()
                    c.packageKind = .formula
                    c.packagingMode = .onlineInstaller
                    c.startHomebrewService = false
                    return c
                }()
            ),
            PackageTemplate(
                name: "Homebrew Background Service",
                summary: "A formula that declares a launchd service, started post-install.",
                configuration: {
                    var c = PackageConfiguration.draft()
                    c.packageKind = .formula
                    c.packagingMode = .onlineInstaller
                    c.startHomebrewService = true
                    return c
                }()
            ),
            PackageTemplate(
                name: "Signed Endpoint Central Package",
                summary: "Enterprise payload, signed, ready for Endpoint Central upload.",
                configuration: {
                    var c = PackageConfiguration.draft()
                    c.packagingMode = .enterprisePayload
                    c.signPackage = true
                    c.generateUninstaller = true
                    c.createDetectionScript = true
                    return c
                }()
            )
        ]
    }
}
