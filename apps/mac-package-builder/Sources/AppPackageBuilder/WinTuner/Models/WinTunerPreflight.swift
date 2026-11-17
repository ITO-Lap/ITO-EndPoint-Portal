import Foundation

/// Pre-package gate mirroring Microsoft's .intunewin process flow: validate the
/// install/uninstall commands, then make sure the source is under the 30 GB
/// Win32 app limit. Pure and unit-testable; no network or process work here.
struct WinTunerPreflight: Equatable {
    static let maxSourceBytes: Int64 = 30 * 1_024 * 1_024 * 1_024

    enum Severity: Equatable { case ok, warning, blocking }

    struct Check: Equatable, Identifiable {
        let id: String
        let title: String
        let detail: String
        let severity: Severity
    }

    let checks: [Check]

    var hasBlocking: Bool { checks.contains { $0.severity == .blocking } }
    /// True when an EXE install command is unconfirmed and the engineer must
    /// explicitly acknowledge it before packaging.
    var needsAcknowledgement: Bool { checks.contains { $0.id == "install-command" && $0.severity == .warning } }

    static func evaluate(
        manifest: WinGetInstallerManifest,
        configuration: WinTunerPackageConfiguration,
        installerBytes: Int64?
    ) -> WinTunerPreflight {
        var checks: [Check] = []

        // Install command
        let typedArgs = configuration.silentInstallerArguments.trimmingCharacters(in: .whitespacesAndNewlines)
        let effectiveType = configuration.installerType.explicitType ?? manifest.installerType
        switch effectiveType {
        case .msi, .msix, .msixBundle, .appx, .appxBundle:
            checks.append(.init(id: "install-command", title: "Install command",
                                detail: "\(effectiveType.displayName) installs silently without extra switches.", severity: .ok))
        case .exe:
            if !typedArgs.isEmpty {
                let fromManifest = typedArgs == (manifest.silentInstallSwitches ?? "")
                checks.append(.init(id: "install-command", title: "Install command",
                                    detail: fromManifest ? "Silent switches \"\(typedArgs)\" come from the WinGet manifest."
                                                         : "Silent switches \"\(typedArgs)\" were entered manually — test before deploying.",
                                    severity: fromManifest ? .ok : .warning))
            } else {
                checks.append(.init(id: "install-command", title: "Install command",
                                    detail: "No silent switches for this EXE. Do not guess — enter them on Configure, or acknowledge to continue.",
                                    severity: .warning))
            }
        }

        // Uninstall command
        let hasUninstall = !(manifest.silentUninstallSwitches ?? "").isEmpty || !(manifest.productCode ?? "").isEmpty
        checks.append(.init(id: "uninstall-command", title: "Uninstall command",
                            detail: hasUninstall ? "Uninstall metadata is available."
                                                 : "No uninstall switches or product code found — the generated uninstall script needs manual review.",
                            severity: hasUninstall ? .ok : .warning))

        // Size gate
        if let bytes = installerBytes {
            let gb = Double(bytes) / 1_073_741_824
            if bytes >= maxSourceBytes {
                checks.append(.init(id: "size", title: "Source size",
                                    detail: String(format: "%.1f GB is over the 30 GB Intune Win32 limit. Clean up the media or reduce the file size.", gb),
                                    severity: .blocking))
            } else {
                checks.append(.init(id: "size", title: "Source size",
                                    detail: String(format: "%.2f GB — under the 30 GB limit.", gb), severity: .ok))
            }
        } else {
            checks.append(.init(id: "size", title: "Source size",
                                detail: "Installer size could not be determined; the 30 GB limit is rechecked after packaging.",
                                severity: .warning))
        }
        return WinTunerPreflight(checks: checks)
    }
}
