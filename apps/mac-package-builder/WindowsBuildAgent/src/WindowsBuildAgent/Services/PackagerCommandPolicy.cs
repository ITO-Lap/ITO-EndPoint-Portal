using System.Text.RegularExpressions;

namespace WindowsBuildAgent.Services;

public sealed class PackagerPolicyException : Exception
{
    public PackagerPolicyException(string message) : base(message) { }
}

/// <summary>An executable plus an argument LIST — never a shell string.</summary>
public sealed record ResolvedCommand(string Executable, IReadOnlyList<string> Arguments);

/// <summary>
/// The worker never trusts the server's command strings. Every install/uninstall command is re-validated here and
/// resolved to (executable, argument list). Only four forms are runnable: msiexec, the job's own setup file, the
/// generated PowerShell wrapper scripts, and — for uninstall only — an absolute unins*/uninstall* executable.
/// Shell operators are refused. This mirrors the server rules in the ITO app (services/winPackager/commands.ts).
/// </summary>
public static partial class PackagerCommandPolicy
{
    private static readonly char[] Forbidden = { '&', '|', ';', '<', '>', '^', '`', '\r', '\n', '\0' };

    [GeneratedRegex(@"^powershell(?:\.exe)? -NoProfile -ExecutionPolicy Bypass -File \.\\(install|uninstall)\.ps1$", RegexOptions.IgnoreCase)]
    private static partial Regex GeneratedScriptRegex();

    [GeneratedRegex(@"^(?:unins\d*|uninstall\w*|uninst\w*)\.exe$", RegexOptions.IgnoreCase)]
    private static partial Regex UninstallerRegex();

    [GeneratedRegex(@"^(?:[A-Za-z0-9 _\-.()+]+/)*[A-Za-z0-9 _\-.()+]+\.(msi|exe|msix|appx)$", RegexOptions.IgnoreCase)]
    private static partial Regex SetupFileRegex();

    [GeneratedRegex(@"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")]
    private static partial Regex JobIdRegex();

    public static bool IsValidJobId(string? id) => id is not null && JobIdRegex().IsMatch(id);

    /// <summary>Relative forward-slash path to an installer inside the source folder; no traversal.</summary>
    public static bool IsValidSetupFile(string? setupFile) =>
        !string.IsNullOrEmpty(setupFile) && setupFile.Length <= 200 && SetupFileRegex().IsMatch(setupFile)
        && !setupFile.Split('/').Any(s => s is ".." or ".");

    /// <summary>Quotes group a token; a backslash is literal (Windows paths). Null when quotes are unbalanced.</summary>
    public static IReadOnlyList<string>? Tokenize(string command)
    {
        var tokens = new List<string>();
        var cur = new System.Text.StringBuilder();
        var inQuote = false;
        var has = false;
        foreach (var ch in command)
        {
            if (ch == '"') { inQuote = !inQuote; has = true; continue; }
            if (!inQuote && char.IsWhiteSpace(ch)) { if (has) { tokens.Add(cur.ToString()); cur.Clear(); has = false; } continue; }
            cur.Append(ch); has = true;
        }
        if (inQuote) return null;
        if (has) tokens.Add(cur.ToString());
        return tokens;
    }

    private static string Norm(string path) => path.Replace('\\', '/').TrimStart('.', '/').ToLowerInvariant();

    /// <param name="contentDir">The extracted source folder (working directory for the command).</param>
    /// <param name="systemDirectory">Environment.SystemDirectory — injected so tests can run off Windows.</param>
    public static ResolvedCommand Resolve(string command, string setupFile, string contentDir, bool isUninstall, string systemDirectory)
    {
        var role = isUninstall ? "uninstall" : "install";
        var trimmed = (command ?? string.Empty).Trim();
        if (trimmed.Length == 0) throw new PackagerPolicyException($"The {role} command is empty.");
        if (trimmed.Length > 600) throw new PackagerPolicyException($"The {role} command is too long.");
        if (trimmed.IndexOfAny(Forbidden) >= 0 || trimmed.Contains("$(", StringComparison.Ordinal))
            throw new PackagerPolicyException($"The {role} command contains shell operators or control characters.");

        var script = GeneratedScriptRegex().Match(trimmed);
        if (script.Success)
        {
            var file = Path.Combine(contentDir, script.Groups[1].Value.ToLowerInvariant() + ".ps1");
            return new ResolvedCommand(
                Path.Combine(systemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe"),
                new[] { "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file });
        }

        var tokens = Tokenize(trimmed);
        if (tokens is null || tokens.Count == 0) throw new PackagerPolicyException($"The {role} command has unbalanced quotes.");
        var program = tokens[0];
        var rest = tokens.Skip(1).ToList();
        var baseName = program.Replace('\\', '/').Split('/').Last();

        if (baseName.Equals("msiexec", StringComparison.OrdinalIgnoreCase) || baseName.Equals("msiexec.exe", StringComparison.OrdinalIgnoreCase))
        {
            if (program.Contains('/') || program.Contains('\\')) throw new PackagerPolicyException("Use plain msiexec without a path.");
            return new ResolvedCommand(Path.Combine(systemDirectory, "msiexec.exe"), rest);
        }

        if (Norm(program) == Norm(setupFile))
            return new ResolvedCommand(Path.Combine(contentDir, setupFile.Replace('/', Path.DirectorySeparatorChar)), rest);

        if (isUninstall && UninstallerRegex().IsMatch(baseName) && (Regex.IsMatch(program, @"^[A-Za-z]:[\\/]") || program.StartsWith('%')))
            return new ResolvedCommand(Environment.ExpandEnvironmentVariables(program), rest);

        throw new PackagerPolicyException($"The {role} command must run msiexec, the setup file, the generated scripts, or (uninstall only) an installed uninstaller.");
    }

    /// <summary>The worker only ever talks to the one configured ITO host, over HTTPS (blocks SSRF via crafted URLs).</summary>
    public static Uri RequireAllowedUrl(string url, string allowedHost, string expectedPathStart)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps
            || !uri.Host.Equals(allowedHost, StringComparison.OrdinalIgnoreCase) || !uri.AbsolutePath.StartsWith(expectedPathStart, StringComparison.Ordinal)
            || !string.IsNullOrEmpty(uri.UserInfo))
            throw new PackagerPolicyException("The transfer URL is not allowed.");
        return uri;
    }
}
