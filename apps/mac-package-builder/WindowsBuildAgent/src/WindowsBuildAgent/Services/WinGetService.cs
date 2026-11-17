using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using WindowsBuildAgent.Models;

namespace WindowsBuildAgent.Services;

public sealed class WinGetOptions
{
    public string ExecutablePath { get; set; } = string.Empty;
    public int ProcessTimeoutSeconds { get; set; } = 120;
}

/// <summary>
/// Wraps `winget search|show|download`. Arguments are always assembled as a
/// list and handed to <see cref="IProcessRunner"/> — never string-concatenated.
/// Package id / version / architecture / scope are validated against strict
/// allowlist regexes before they are ever placed in the argument list, and
/// again defensively immediately before use.
/// </summary>
public sealed partial class WinGetService : IWinGetService
{
    // WinGet package ids look like "Publisher.Product" or "Publisher.Product.SubProduct",
    // occasionally with digits/hyphens/underscores/plus. Reject anything else outright —
    // this is the single most important allowlist in the agent, since the id
    // flows directly into an external process argument.
    [GeneratedRegex(@"^[A-Za-z0-9][A-Za-z0-9_.+-]{0,127}$")]
    private static partial Regex PackageIdRegex();

    [GeneratedRegex(@"^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$")]
    private static partial Regex VersionRegex();

    private static readonly HashSet<string> AllowedArchitectures = new(StringComparer.OrdinalIgnoreCase)
    {
        "x86", "x64", "arm", "arm64", "neutral"
    };

    private static readonly HashSet<string> AllowedScopes = new(StringComparer.OrdinalIgnoreCase)
    {
        "user", "machine"
    };

    // Search query allows a fairly permissive but still bounded character
    // set: letters, digits, spaces, and a handful of punctuation marks
    // commonly found in product names. No shell metacharacters permitted.
    [GeneratedRegex(@"^[A-Za-z0-9 ._+#/-]{1,200}$")]
    private static partial Regex SearchQueryRegex();

    private readonly IProcessRunner _processRunner;
    private readonly WinGetOptions _options;
    private readonly ILogger<WinGetService> _logger;

    public WinGetService(IProcessRunner processRunner, IOptions<WinGetOptions> options, ILogger<WinGetService> logger)
    {
        _processRunner = processRunner;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<IReadOnlyList<WinGetPackageDto>> SearchAsync(string query, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query) || !SearchQueryRegex().IsMatch(query))
        {
            throw new WinGetValidationException("Search query contains characters outside the allowed set.");
        }

        var arguments = new List<string>
        {
            "search",
            "--query", query,
            "--source", "winget",
            "--accept-source-agreements",
            "--disable-interactivity"
        };

        var result = await RunWinGetAsync(arguments, cancellationToken).ConfigureAwait(false);
        return ParseSearchOutput(result.StdOut);
    }

    public async Task<WinGetPackageDetailDto> ShowAsync(string packageId, string? version, CancellationToken cancellationToken)
    {
        ValidatePackageId(packageId);
        if (version is not null) ValidateVersion(version);

        var arguments = new List<string>
        {
            "show",
            "--id", packageId,
            "--exact",
            "--source", "winget",
            "--accept-source-agreements",
            "--disable-interactivity"
        };

        if (version is not null)
        {
            arguments.Add("--version");
            arguments.Add(version);
        }

        var result = await RunWinGetAsync(arguments, cancellationToken).ConfigureAwait(false);
        return ParseShowOutput(packageId, result.StdOut);
    }

    public async Task<string> DownloadAsync(
        string packageId,
        string version,
        string architecture,
        string scope,
        string destinationDirectory,
        CancellationToken cancellationToken)
    {
        ValidatePackageId(packageId);
        ValidateVersion(version);
        ValidateArchitecture(architecture);
        ValidateScope(scope);

        if (string.IsNullOrWhiteSpace(destinationDirectory) || !Directory.Exists(destinationDirectory))
        {
            throw new WinGetValidationException("Destination directory must already exist and be validated by the caller.");
        }

        // NOTE: --ignore-security-hash is NEVER passed. If winget's own
        // hash verification fails, the download must fail loudly; the
        // agent's own SHA-256 comparison (HashComparisonTests) is a second,
        // independent check performed by the caller after download.
        var arguments = new List<string>
        {
            "download",
            "--id", packageId,
            "--exact",
            "--version", version,
            "--architecture", architecture,
            "--scope", scope,
            "--source", "winget",
            "--download-directory", destinationDirectory,
            "--accept-source-agreements",
            "--accept-package-agreements",
            "--disable-interactivity"
        };

        var result = await RunWinGetAsync(arguments, cancellationToken, timeoutOverride: TimeSpan.FromSeconds(Math.Max(_options.ProcessTimeoutSeconds, 300)))
            .ConfigureAwait(false);

        var downloaded = Directory.EnumerateFiles(destinationDirectory, "*", SearchOption.AllDirectories)
            .Where(f => !f.EndsWith(".yaml", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(File.GetLastWriteTimeUtc)
            .FirstOrDefault();

        if (downloaded is null)
        {
            throw new WinGetValidationException($"winget download reported success but no installer file was found. Output: {result.StdOut}");
        }

        return downloaded;
    }

    private async Task<ProcessRunResult> RunWinGetAsync(
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken,
        TimeSpan? timeoutOverride = null)
    {
        var timeout = timeoutOverride ?? TimeSpan.FromSeconds(_options.ProcessTimeoutSeconds);
        var result = await _processRunner.RunAsync(_options.ExecutablePath, arguments, workingDirectory: null, timeout, cancellationToken)
            .ConfigureAwait(false);

        if (result.TimedOut)
        {
            throw new WinGetValidationException("winget.exe did not complete within the configured timeout.");
        }

        if (result.ExitCode != 0)
        {
            _logger.LogWarning("winget exited with code {ExitCode}: {StdErr}", result.ExitCode, result.StdErr);
            throw new WinGetValidationException($"winget exited with code {result.ExitCode}: {Truncate(result.StdErr)}");
        }

        return result;
    }

    private static string Truncate(string value, int max = 1000) =>
        value.Length <= max ? value : value[..max] + "…";

    internal static void ValidatePackageId(string packageId)
    {
        if (string.IsNullOrWhiteSpace(packageId) || !PackageIdRegex().IsMatch(packageId))
        {
            throw new WinGetValidationException($"Package id '{packageId}' failed allowlist validation.");
        }
    }

    internal static void ValidateVersion(string version)
    {
        if (string.IsNullOrWhiteSpace(version) || !VersionRegex().IsMatch(version))
        {
            throw new WinGetValidationException($"Version '{version}' failed allowlist validation.");
        }
    }

    internal static void ValidateArchitecture(string architecture)
    {
        if (string.IsNullOrWhiteSpace(architecture) || !AllowedArchitectures.Contains(architecture))
        {
            throw new WinGetValidationException($"Architecture '{architecture}' is not in the allowed set.");
        }
    }

    internal static void ValidateScope(string scope)
    {
        if (string.IsNullOrWhiteSpace(scope) || !AllowedScopes.Contains(scope))
        {
            throw new WinGetValidationException($"Scope '{scope}' is not in the allowed set.");
        }
    }

    /// <summary>
    /// Parses the fixed-width/column table produced by `winget search`.
    /// The header row is "Name", "Id", "Version", "Match", "Source" (Match is
    /// optional/absent depending on winget version); columns are aligned with
    /// runs of two or more spaces separating them, which is the same
    /// heuristic winget's own consumers use since there is no --format json
    /// on all supported winget versions.
    /// </summary>
    internal static IReadOnlyList<WinGetPackageDto> ParseSearchOutput(string stdOut)
    {
        var lines = stdOut.Replace("\r\n", "\n").Split('\n');
        var results = new List<WinGetPackageDto>();

        var headerIndex = Array.FindIndex(lines, l => l.TrimStart().StartsWith("Name", StringComparison.Ordinal) && l.Contains("Id", StringComparison.Ordinal));
        if (headerIndex < 0) return results;

        var header = lines[headerIndex];
        var columns = SplitColumns(header);
        if (columns.Count < 3) return results;

        // Column start offsets, derived from the header text itself.
        var offsets = columns.Select(c => header.IndexOf(c.Name, StringComparison.Ordinal)).ToList();

        // Skip header + separator ("----") line.
        for (var i = headerIndex + 1; i < lines.Length; i++)
        {
            var line = lines[i];
            if (string.IsNullOrWhiteSpace(line)) continue;
            if (line.TrimStart().StartsWith('-')) continue;

            var fields = new List<string>();
            for (var c = 0; c < offsets.Count; c++)
            {
                var start = offsets[c];
                var end = c + 1 < offsets.Count ? offsets[c + 1] : line.Length;
                if (start >= line.Length) { fields.Add(string.Empty); continue; }
                end = Math.Min(end, line.Length);
                fields.Add(line[start..end].Trim());
            }

            if (fields.Count < 3) continue;

            var name = fields[0];
            var id = fields[1];
            var version = fields[2];
            var source = fields.Count > 4 ? fields[4] : (fields.Count > 3 ? fields[3] : "winget");

            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(name)) continue;

            results.Add(new WinGetPackageDto(id, name, Publisher: string.Empty, version, string.IsNullOrWhiteSpace(source) ? "winget" : source));
        }

        return results;
    }

    private sealed record HeaderColumn(string Name);

    private static List<HeaderColumn> SplitColumns(string header)
    {
        return Regex.Matches(header, @"\S+(?:\s\S+)*?(?=\s{2,}|$)")
            .Select(m => new HeaderColumn(m.Value))
            .ToList();
    }

    /// <summary>
    /// Parses the "Key: Value" block produced by `winget show` into a
    /// structured detail DTO. Unknown/missing fields default to empty/false
    /// rather than throwing, since winget's show output varies by manifest.
    /// </summary>
    internal static WinGetPackageDetailDto ParseShowOutput(string packageId, string stdOut)
    {
        var lines = stdOut.Replace("\r\n", "\n").Split('\n');
        string? Get(string key)
        {
            var prefix = key + ":";
            var line = lines.FirstOrDefault(l => l.Trim().StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
            if (line is null) return null;
            var idx = line.IndexOf(':');
            return idx >= 0 ? line[(idx + 1)..].Trim() : null;
        }

        var name = Get("Found") ?? Get("DisplayName") ?? packageId;
        var publisher = Get("Publisher") ?? string.Empty;
        var version = Get("Version") ?? string.Empty;
        var description = Get("Description");
        var homepage = Get("Homepage");
        var license = Get("License");
        var installerType = Get("Installer Type") ?? Get("InstallerType") ?? "unknown";
        var architecture = Get("Architecture") ?? "x64";
        var scope = Get("Scope") ?? "user";
        var installerUrl = Get("Installer Url") ?? Get("Download Url");
        var sha256 = Get("Installer SHA256") ?? Get("SHA256");
        var offline = Get("Offline Distribution Supported");

        var availableVersions = lines
            .SkipWhile(l => !l.TrimStart().StartsWith("Version:", StringComparison.OrdinalIgnoreCase))
            .Skip(1)
            .TakeWhile(l => l.StartsWith("  ") || l.StartsWith("\t"))
            .Select(l => l.Trim())
            .Where(l => l.Length > 0)
            .ToList();

        var dependencies = lines
            .SkipWhile(l => !l.Trim().Equals("Dependencies:", StringComparison.OrdinalIgnoreCase))
            .Skip(1)
            .TakeWhile(l => l.StartsWith("  ") || l.StartsWith("\t"))
            .Select(l => l.Trim())
            .Where(l => l.Length > 0)
            .ToList();

        return new WinGetPackageDetailDto(
            packageId,
            name,
            publisher,
            version,
            description,
            homepage,
            license,
            installerType,
            architecture,
            scope,
            installerUrl,
            sha256,
            SupportsOffline: string.Equals(offline, "true", StringComparison.OrdinalIgnoreCase),
            dependencies,
            availableVersions.Count > 0 ? availableVersions : new List<string> { version });
    }
}
