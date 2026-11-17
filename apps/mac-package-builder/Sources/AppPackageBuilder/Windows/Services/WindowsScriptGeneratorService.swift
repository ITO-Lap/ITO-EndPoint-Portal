import Foundation

/// Generates `Install.ps1`/`Uninstall.ps1` text for a Windows package export.
/// Pure text generation — nothing here ever executes a Windows tool or
/// PowerShell locally; this runs safely on macOS and produces text that is
/// only ever run on a managed Windows endpoint by the deployment tool
/// (Intune/Endpoint Central), mirroring `ScriptGeneratorService.swift`'s
/// role for the macOS `.pkg` flow.
///
/// For MSI installers, silent install/uninstall commands are derived
/// deterministically from standard `msiexec` switches. For EXE installers,
/// a real silent command is only emitted when `configuration.installCommand`/
/// `uninstallCommand` were explicitly set — which, upstream, means they came
/// from a verified WinGet manifest silent-switch field, not a guess. This
/// service never invents an EXE silent switch.
final class WindowsScriptGeneratorService {

    static let adminReviewPlaceholder = "Silent installation command requires administrator review."

    func generateInstallScript(configuration: WindowsPackageConfiguration) -> String {
        var lines: [String] = []
        lines.append(header(title: "Install"))
        lines.append("")
        lines.append("$ErrorActionPreference = 'Stop'")
        lines.append("")

        switch effectiveCommand(configuration: configuration, isInstall: true) {
        case .command(let command):
            lines.append("Write-Output 'Starting installation...'")
            lines.append(command)
            lines.append("$exitCode = $LASTEXITCODE")
            lines.append(returnCodeHandlingBlock(configuration: configuration))
        case .requiresReview:
            lines.append("# \(Self.adminReviewPlaceholder)")
            lines.append("Write-Output '\(Self.adminReviewPlaceholder)'")
            lines.append("exit 1")
        }

        return lines.joined(separator: "\n") + "\n"
    }

    func generateUninstallScript(configuration: WindowsPackageConfiguration) -> String {
        var lines: [String] = []
        lines.append(header(title: "Uninstall"))
        lines.append("")
        lines.append("$ErrorActionPreference = 'Stop'")
        lines.append("")

        switch effectiveCommand(configuration: configuration, isInstall: false) {
        case .command(let command):
            lines.append("Write-Output 'Starting uninstallation...'")
            lines.append(command)
            lines.append("$exitCode = $LASTEXITCODE")
            lines.append(returnCodeHandlingBlock(configuration: configuration))
        case .requiresReview:
            lines.append("# \(Self.adminReviewPlaceholder)")
            lines.append("Write-Output '\(Self.adminReviewPlaceholder)'")
            lines.append("exit 1")
        }

        return lines.joined(separator: "\n") + "\n"
    }

    // MARK: - Command derivation

    private enum EffectiveCommand {
        case command(String)
        case requiresReview
    }

    /// MSI silent switches are standard and safe to derive; EXE silent
    /// switches vary per-vendor, so an EXE only gets a real command when the
    /// caller has already supplied one (i.e. it was verified upstream, from
    /// the WinGet manifest's declared silent-switch field). Detecting "was
    /// this explicitly supplied" is approximated by "is it non-empty" since
    /// `WindowsPackageConfiguration.validateStrictFields()` already requires
    /// both fields to be non-empty for MSI paths that go through this
    /// service via the wizard's Configure step.
    private func effectiveCommand(configuration: WindowsPackageConfiguration, isInstall: Bool) -> EffectiveCommand {
        switch installerTypeHint(configuration: configuration) {
        case .msi:
            guard let productCode = msiProductCode(configuration: configuration) else {
                return isInstall ? .command(msiInstallCommand(configuration: configuration)) : .requiresReview
            }
            return isInstall
                ? .command(msiInstallCommand(configuration: configuration))
                : .command(msiUninstallCommand(productCode: productCode))
        case .exe, .msix, .msixBundle, .other:
            let raw = isInstall ? configuration.installCommand : configuration.uninstallCommand
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, isLikelySilentCommand(trimmed) else {
                return .requiresReview
            }
            return .command(trimmed)
        }
    }

    /// The installer type isn't modeled directly on `WindowsPackageConfiguration`
    /// (it's on `WinGetPackageDetail`), so infer MSI-ness from the presence of
    /// a `.msi` path in the authored commands. When neither command mentions
    /// `.msi`, treat it as an EXE/other installer and require an explicit
    /// verified command.
    private func installerTypeHint(configuration: WindowsPackageConfiguration) -> WinGetPackageDetail.InstallerType {
        let combined = "\(configuration.installCommand) \(configuration.uninstallCommand)".lowercased()
        if combined.contains(".msi") {
            return .msi
        }
        return .exe
    }

    private func msiInstallCommand(configuration: WindowsPackageConfiguration) -> String {
        let path = extractQuotedOrFirstToken(configuration.installCommand) ?? "<Installer.msi>"
        return "Start-Process -FilePath 'msiexec.exe' -ArgumentList '/i \"\(path)\" /qn /norestart' -Wait -PassThru | Out-Null"
    }

    private func msiUninstallCommand(productCode: String) -> String {
        "Start-Process -FilePath 'msiexec.exe' -ArgumentList '/x \(productCode) /qn /norestart' -Wait -PassThru | Out-Null"
    }

    /// Looks for a GUID-shaped MSI product code in the authored uninstall
    /// command text.
    private func msiProductCode(configuration: WindowsPackageConfiguration) -> String? {
        let pattern = #"\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let text = configuration.uninstallCommand
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        guard let match = regex.firstMatch(in: text, range: range), let matchRange = Range(match.range, in: text) else {
            return nil
        }
        return String(text[matchRange])
    }

    /// A conservative check that an authored EXE command already looks like a
    /// documented silent invocation rather than an interactive one — this is
    /// a sanity check on already-trusted, upstream-verified text, not a
    /// substitute for that verification.
    private func isLikelySilentCommand(_ command: String) -> Bool {
        let lowered = command.lowercased()
        let silentMarkers = ["/s", "/silent", "/quiet", "/qn", "/verysilent", "--silent", "--quiet", "-silent", "-s"]
        return silentMarkers.contains { lowered.contains($0) }
    }

    private func extractQuotedOrFirstToken(_ command: String) -> String? {
        if let firstQuote = command.firstIndex(of: "\""),
           let lastQuote = command[command.index(after: firstQuote)...].firstIndex(of: "\"") {
            return String(command[command.index(after: firstQuote)..<lastQuote])
        }
        return command.split(separator: " ").first.map(String.init)
    }

    // MARK: - Shared script scaffolding

    private func header(title: String) -> String {
        """
        # \(title).ps1
        # Generated by App Package Builder. Noninteractive, 64-bit PowerShell.
        # Do not run interactively — intended for execution by a managed
        # deployment tool (Intune / Endpoint Central) under the system or user
        # context configured in Package.json.
        """
    }

    private func returnCodeHandlingBlock(configuration: WindowsPackageConfiguration) -> String {
        var lines: [String] = ["switch ($exitCode) {"]
        for (code, meaning) in configuration.returnCodes.sorted(by: { $0.key < $1.key }) {
            lines.append("    \(code) { Write-Output 'Exit code \(code): \(escapeSingleQuoted(meaning))'; exit \(code) }")
        }
        lines.append("    default { Write-Output \"Exit code $exitCode: unrecognized\"; exit $exitCode }")
        lines.append("}")
        return lines.joined(separator: "\n")
    }

    private func escapeSingleQuoted(_ value: String) -> String {
        value.replacingOccurrences(of: "'", with: "''")
    }
}
