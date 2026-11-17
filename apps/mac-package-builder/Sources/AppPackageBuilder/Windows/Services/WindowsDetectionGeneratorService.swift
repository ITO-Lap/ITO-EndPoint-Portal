import Foundation

/// Renders `Detect.ps1`/`Requirements.ps1` text from a `DetectionRule` tree
/// and `WindowsPackageConfiguration`'s requirements fields. Pure string
/// templating — nothing here executes PowerShell; the generated text is only
/// ever run on a managed Windows endpoint, mirroring
/// `ScriptGeneratorService.generateDetectionScript`'s role for the macOS
/// flow.
final class WindowsDetectionGeneratorService {

    /// Renders a noninteractive detection script for `rules`. Always exits 0
    /// (detected/installed) or 1 (not detected) so Intune/Endpoint Central
    /// can read a single documented signal.
    func generateDetectionScript(rules: DetectionRule) -> String {
        var lines: [String] = []
        lines.append(contentsOf: scriptPreamble(title: "Detect"))
        lines.append("")
        lines.append("# Exit 0 = detected/installed. Exit 1 = not detected.")
        lines.append("")
        lines.append("function Test-Rule {")
        lines.append(indent(renderRule(rules), by: 1))
        lines.append("}")
        lines.append("")
        lines.append("if (Test-Rule) {")
        lines.append("    Write-Output 'DETECTED'")
        lines.append("    exit 0")
        lines.append("} else {")
        lines.append("    Write-Output 'NOT_DETECTED'")
        lines.append("    exit 1")
        lines.append("}")
        return lines.joined(separator: "\n") + "\n"
    }

    /// Renders a noninteractive requirements-check script from
    /// `configuration.requirements`, `minimumWindowsVersion`, and
    /// `architecture`. Exit 0 = all requirements met, exit 1 = not met.
    func generateRequirementsScript(configuration: WindowsPackageConfiguration) -> String {
        var lines: [String] = []
        lines.append(contentsOf: scriptPreamble(title: "Requirements"))
        lines.append("")
        lines.append("# Exit 0 = all requirements met. Exit 1 = a requirement failed.")
        lines.append("")
        lines.append("$failures = @()")
        lines.append("")

        lines.append("# Minimum Windows version: \(configuration.minimumWindowsVersion)")
        lines.append("$osVersion = [System.Environment]::OSVersion.Version")
        lines.append("$minVersion = [Version]'\(configuration.minimumWindowsVersion)'")
        lines.append("if ($osVersion -lt $minVersion) {")
        lines.append("    $failures += \"OS version $osVersion is below required $minVersion\"")
        lines.append("}")
        lines.append("")

        lines.append("# Architecture: \(configuration.architecture.rawValue)")
        lines.append("$requiredArch = '\(architectureCheckValue(configuration.architecture))'")
        lines.append("$actualArch = $env:PROCESSOR_ARCHITECTURE")
        lines.append("if ($requiredArch -ne 'any' -and $actualArch -notlike \"*$requiredArch*\") {")
        lines.append("    $failures += \"Processor architecture $actualArch does not match required $requiredArch\"")
        lines.append("}")
        lines.append("")

        for requirement in configuration.requirements {
            lines.append("# Requirement (admin-authored, not auto-verified beyond presence): \(escapeComment(requirement))")
            lines.append("Write-Output 'Requirement noted: \(escapeSingleQuoted(requirement))'")
        }
        lines.append("")

        lines.append("if ($failures.Count -gt 0) {")
        lines.append("    foreach ($f in $failures) { Write-Output \"REQUIREMENT_FAILED: $f\" }")
        lines.append("    exit 1")
        lines.append("} else {")
        lines.append("    Write-Output 'ALL_REQUIREMENTS_MET'")
        lines.append("    exit 0")
        lines.append("}")

        return lines.joined(separator: "\n") + "\n"
    }

    // MARK: - Rule rendering

    /// Renders one `DetectionRule` node as a PowerShell expression body that
    /// returns `$true`/`$false` from the enclosing `Test-Rule` function.
    private func renderRule(_ rule: DetectionRule) -> String {
        switch rule {
        case .msiProductCode(let code):
            return renderMsiProductCode(code)
        case .registryValue(let path, let valueName, let expected):
            return renderRegistryValue(path: path, valueName: valueName, expected: expected)
        case .fileExists(let path):
            return renderFileExists(path: path)
        case .fileVersion(let path, let comparator, let version):
            return renderFileVersion(path: path, comparator: comparator, version: version)
        case .powerShellCustom(let script):
            return renderPowerShellCustom(script: script)
        case .combined(let op, let rules):
            return renderCombined(operator: op, rules: rules)
        }
    }

    private func renderMsiProductCode(_ code: String) -> String {
        """
        # MSI product code lookup via the standard Uninstall registry keys
        # (both 64-bit and WOW6432Node views).
        $paths = @(
            "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\\(escapePowerShellString(code))",
            "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\\(escapePowerShellString(code))"
        )
        foreach ($p in $paths) {
            if (Test-Path $p) { return $true }
        }
        return $false
        """
    }

    private func renderRegistryValue(path: String, valueName: String, expected: String) -> String {
        """
        $regPath = "\(escapePowerShellString(path))"
        $regName = "\(escapePowerShellString(valueName))"
        if (-not (Test-Path $regPath)) { return $false }
        $actual = (Get-ItemProperty -Path $regPath -Name $regName -ErrorAction SilentlyContinue).$regName
        return ($null -ne $actual -and "$actual" -eq "\(escapePowerShellString(expected))")
        """
    }

    private func renderFileExists(path: String) -> String {
        """
        return (Test-Path -Path "\(escapePowerShellString(path))" -PathType Leaf)
        """
    }

    private func renderFileVersion(path: String, comparator: DetectionRule.Comparator, version: String) -> String {
        """
        $filePath = "\(escapePowerShellString(path))"
        if (-not (Test-Path -Path $filePath -PathType Leaf)) { return $false }
        $actualVersion = [Version](Get-Item $filePath).VersionInfo.FileVersion
        $requiredVersion = [Version]'\(escapePowerShellString(version))'
        return ($actualVersion \(comparatorOperator(comparator)) $requiredVersion)
        """
    }

    private func renderPowerShellCustom(script: String) -> String {
        """
        # BEGIN admin-authored custom PowerShell detection logic (provenance:
        # entered directly in the Configure step by the packaging admin; not
        # generated or verified by App Package Builder). The script below
        # must set $customResult to $true or $false.
        $customResult = $false
        \(script)
        # END admin-authored custom PowerShell detection logic
        return [bool]$customResult
        """
    }

    private func renderCombined(operator op: DetectionRule.LogicalOperator, rules: [DetectionRule]) -> String {
        guard !rules.isEmpty else { return "return $false" }
        var lines: [String] = []
        for (index, rule) in rules.enumerated() {
            lines.append("# Combined rule child \(index + 1) of \(rules.count) (\(op == .and ? "AND" : "OR"))")
            lines.append("$child\(index) = & {")
            lines.append(indent(renderRule(rule), by: 1))
            lines.append("}")
        }
        let names = (0..<rules.count).map { "$child\($0)" }
        let joinOperator = op == .and ? "-and" : "-or"
        lines.append("return (\(names.joined(separator: " \(joinOperator) ")))")
        return lines.joined(separator: "\n")
    }

    private func comparatorOperator(_ comparator: DetectionRule.Comparator) -> String {
        switch comparator {
        case .equals: return "-eq"
        case .greaterThanOrEqual: return "-ge"
        case .greaterThan: return "-gt"
        case .lessThanOrEqual: return "-le"
        case .lessThan: return "-lt"
        }
    }

    private func architectureCheckValue(_ architecture: WinGetPackageDetail.Architecture) -> String {
        switch architecture {
        case .x86: return "x86"
        case .x64: return "AMD64"
        case .arm64: return "ARM64"
        }
    }

    // MARK: - Shared script scaffolding

    private func scriptPreamble(title: String) -> [String] {
        [
            "# \(title).ps1",
            "# Generated by App Package Builder. Noninteractive, 64-bit PowerShell,",
            "# safe to run unattended by a managed deployment tool (Intune /",
            "# Endpoint Central). Produces log output via Write-Output; documented",
            "# exit codes only (see below) — no user prompts, no GUI.",
            "$ErrorActionPreference = 'Stop'",
        ]
    }

    private func indent(_ text: String, by levels: Int) -> String {
        let prefix = String(repeating: "    ", count: levels)
        return text.split(separator: "\n", omittingEmptySubsequences: false)
            .map { $0.isEmpty ? String($0) : prefix + $0 }
            .joined(separator: "\n")
    }

    private func escapePowerShellString(_ value: String) -> String {
        value.replacingOccurrences(of: "`", with: "``").replacingOccurrences(of: "\"", with: "`\"")
    }

    private func escapeSingleQuoted(_ value: String) -> String {
        value.replacingOccurrences(of: "'", with: "''")
    }

    private func escapeComment(_ value: String) -> String {
        value.replacingOccurrences(of: "\n", with: " ")
    }
}
