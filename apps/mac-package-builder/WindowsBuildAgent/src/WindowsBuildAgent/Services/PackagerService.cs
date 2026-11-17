using System.Diagnostics;
using System.IO.Compression;
using System.Security.Cryptography;
using Microsoft.Extensions.Options;
using WindowsBuildAgent.Endpoints;
using WindowsBuildAgent.Models;

namespace WindowsBuildAgent.Services;

public sealed class PackagerOptions
{
    /// <summary>The only host the worker will fetch sources from / upload packages to (the ITO server).</summary>
    public string AllowedServerHost { get; set; } = string.Empty;
    public long MaxSourceBytes { get; set; } = 30L * 1024 * 1024 * 1024;
    public int StepTimeoutMinutes { get; set; } = 30;
    public string WorkspaceRoot { get; set; } = string.Empty;
    public int MaxConcurrent { get; set; } = 1;
}

public interface IPackagerService
{
    Task<PackagerValidateResponse> ValidateAsync(PackagerValidateRequest request, CancellationToken cancellationToken);
    Task<PackagerPackageResponse> PackageAsync(PackagerPackageRequest request, CancellationToken cancellationToken);
}

/// <summary>
/// Implements the ITO Windows Package Builder worker contract: install → detect → uninstall → detect-gone validation, and
/// IntuneWinAppUtil packaging. Everything runs in a unique, disposable workspace; every command is re-validated by
/// <see cref="PackagerCommandPolicy"/> and run through <see cref="IProcessRunner"/> with an argument LIST. Run this agent
/// only on a disposable/snapshot-reverted VM: validation really installs the uploaded software.
/// </summary>
public sealed class PackagerService : IPackagerService
{
    private static readonly int[] SuccessCodes = { 0, 1707 };
    private static readonly int[] RebootCodes = { 3010, 1641 };
    private const int LogLimit = 8 * 1024;

    private readonly IProcessRunner _runner;
    private readonly IPackagerTransport _transport;
    private readonly PackagerOptions _options;
    private readonly IntuneWinAppUtilOptions _intune;
    private readonly string _agentName;
    private readonly string _systemDirectory;
    private readonly SemaphoreSlim _slots;

    public PackagerService(IProcessRunner runner, IPackagerTransport transport, IOptions<PackagerOptions> options,
        IOptions<IntuneWinAppUtilOptions> intune, IOptions<AgentInfoOptions> info, IOptions<JobStoreOptions> jobStore, string? systemDirectory = null)
    {
        _runner = runner; _transport = transport; _options = options.Value; _intune = intune.Value; _agentName = info.Value.AgentName;
        _systemDirectory = systemDirectory ?? Environment.SystemDirectory;
        if (string.IsNullOrWhiteSpace(_options.WorkspaceRoot)) _options.WorkspaceRoot = Path.Combine(jobStore.Value.RootDirectory, "packager");
        _slots = new SemaphoreSlim(Math.Max(1, _options.MaxConcurrent));
    }

    private string NewWorkspace(string jobId)
    {
        if (!PackagerCommandPolicy.IsValidJobId(jobId)) throw new PackagerPolicyException("Invalid job id.");
        var dir = Path.Combine(Path.GetFullPath(_options.WorkspaceRoot), jobId + "-" + Guid.NewGuid().ToString("N")[..8]);
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static void Cleanup(string dir)
    {
        try { if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true); } catch { /* best effort; the retention sweep also removes old workspaces */ }
    }

    private async Task<string> FetchSourceAsync(string workspace, string sourceUrl, string jobId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_options.AllowedServerHost)) throw new PackagerPolicyException("Packager:AllowedServerHost is not configured.");
        var uri = PackagerCommandPolicy.RequireAllowedUrl(sourceUrl, _options.AllowedServerHost, $"/api/win-packager-worker/{jobId}/source");
        var zip = Path.Combine(workspace, "source.zip");
        await _transport.DownloadAsync(uri, zip, _options.MaxSourceBytes, ct).ConfigureAwait(false);
        var content = Path.Combine(workspace, "content");
        ExtractSafely(zip, content, _options.MaxSourceBytes);
        File.Delete(zip);
        return content;
    }

    /// <summary>Extracts a zip, refusing any entry that would land outside <paramref name="destination"/>.</summary>
    internal static void ExtractSafely(string zipFile, string destination, long maxTotalBytes)
    {
        var root = Path.GetFullPath(destination);
        Directory.CreateDirectory(root);
        using var archive = ZipFile.OpenRead(zipFile);
        long total = 0;
        foreach (var entry in archive.Entries)
        {
            var name = entry.FullName;
            var parts = name.Replace('\\', '/').Split('/');
            if (name.Contains('\0') || Path.IsPathRooted(name) || name.StartsWith('/') || name.StartsWith('\\') || parts.Contains(".."))
                throw new PackagerPolicyException("The source archive contains an unsafe path.");
            var target = Path.GetFullPath(Path.Combine(root, name));
            if (target != root && !target.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal))
                throw new PackagerPolicyException("The source archive contains an unsafe path.");
            if (name.EndsWith('/')) { Directory.CreateDirectory(target); continue; }
            total += entry.Length;
            if (total > maxTotalBytes) throw new PackagerPolicyException("The source exceeds the configured size limit.");
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            entry.ExtractToFile(target, overwrite: false);
        }
    }

    private static string Clip(string s) => s.Length <= LogLimit ? s : s[..LogLimit] + "\n…[truncated]";

    private async Task<PackagerStepDto> RunStepAsync(string name, ResolvedCommand cmd, string workingDir, Func<int, bool> passes, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            var r = await _runner.RunAsync(cmd.Executable, cmd.Arguments, workingDir, TimeSpan.FromMinutes(_options.StepTimeoutMinutes), ct).ConfigureAwait(false);
            var ok = !r.TimedOut && passes(r.ExitCode);
            return new PackagerStepDto(name, ok ? "pass" : "fail", r.TimedOut ? null : r.ExitCode, sw.ElapsedMilliseconds,
                RebootCodes.Contains(r.ExitCode), Clip(r.StdOut), Clip(r.TimedOut ? r.StdErr + "\nStep timed out." : r.StdErr));
        }
        catch (ProcessRunnerException ex)
        {
            return new PackagerStepDto(name, "fail", null, sw.ElapsedMilliseconds, false, null, ex.Message);
        }
    }

    public async Task<PackagerValidateResponse> ValidateAsync(PackagerValidateRequest req, CancellationToken ct)
    {
        if (!PackagerCommandPolicy.IsValidSetupFile(req.SetupFile)) throw new PackagerPolicyException("Invalid setup file.");
        if (string.IsNullOrWhiteSpace(req.DetectionScript) || req.DetectionScript.Length > 16 * 1024) throw new PackagerPolicyException("Invalid detection script.");
        var dir = NewWorkspace(req.JobId); // validates the job id before anything is touched
        await _slots.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var content = await FetchSourceAsync(dir, req.SourceUrl, req.JobId, ct).ConfigureAwait(false);
            if (!File.Exists(Path.Combine(content, req.SetupFile.Replace('/', Path.DirectorySeparatorChar)))) throw new PackagerPolicyException("The setup file is not in the source.");

            // Resolve BOTH commands up front so a bad uninstall command is rejected before anything is installed.
            var install = PackagerCommandPolicy.Resolve(req.InstallCommand, req.SetupFile, content, isUninstall: false, _systemDirectory);
            var uninstall = PackagerCommandPolicy.Resolve(req.UninstallCommand, req.SetupFile, content, isUninstall: true, _systemDirectory);

            // The detection script lives OUTSIDE the content folder and is run with a fixed argument list.
            var tools = Path.Combine(dir, "tools"); Directory.CreateDirectory(tools);
            var detection = Path.Combine(tools, "detection.ps1");
            await File.WriteAllTextAsync(detection, req.DetectionScript, ct).ConfigureAwait(false);
            var detect = new ResolvedCommand(Path.Combine(_systemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe"),
                new[] { "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", detection });

            var steps = new List<PackagerStepDto>();
            PackagerStepDto Skipped(string n) => new(n, "skipped", null, null, false, null, null);
            bool Detected(int code, PackagerStepDto s) => code == 0 && !string.IsNullOrWhiteSpace(s.Stdout);

            var s1 = await RunStepAsync("install", install, content, c => SuccessCodes.Contains(c) || RebootCodes.Contains(c), ct).ConfigureAwait(false);
            steps.Add(s1);
            if (s1.Status != "pass") { steps.Add(Skipped("detect-after-install")); steps.Add(Skipped("uninstall")); steps.Add(Skipped("detect-after-uninstall")); return Done(steps); }

            var s2 = await RunStepAsync("detect-after-install", detect, tools, _ => true, ct).ConfigureAwait(false);
            s2 = s2 with { Status = s2.Status == "pass" && Detected(s2.ExitCode ?? -1, s2) ? "pass" : "fail" };
            steps.Add(s2);
            if (s2.Status != "pass") { steps.Add(Skipped("uninstall")); steps.Add(Skipped("detect-after-uninstall")); return Done(steps); }

            var s3 = await RunStepAsync("uninstall", uninstall, content, c => SuccessCodes.Contains(c) || RebootCodes.Contains(c), ct).ConfigureAwait(false);
            steps.Add(s3);
            if (s3.Status != "pass") { steps.Add(Skipped("detect-after-uninstall")); return Done(steps); }

            // After uninstall, detection must NOT succeed (non-zero exit or no output).
            var s4 = await RunStepAsync("detect-after-uninstall", detect, tools, _ => true, ct).ConfigureAwait(false);
            s4 = s4 with { Status = s4.Status == "pass" && !Detected(s4.ExitCode ?? -1, s4) ? "pass" : "fail" };
            steps.Add(s4);
            return Done(steps);
        }
        finally { _slots.Release(); Cleanup(dir); }
    }

    private PackagerValidateResponse Done(List<PackagerStepDto> steps) => new(steps, _agentName);

    public async Task<PackagerPackageResponse> PackageAsync(PackagerPackageRequest req, CancellationToken ct)
    {
        if (!PackagerCommandPolicy.IsValidSetupFile(req.SetupFile)) throw new PackagerPolicyException("Invalid setup file.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(req.OutputName ?? string.Empty, @"^[A-Za-z0-9._-]{1,150}\.intunewin$")) throw new PackagerPolicyException("Invalid output name.");
        if (string.IsNullOrWhiteSpace(_intune.ExecutablePath) || !File.Exists(_intune.ExecutablePath)) throw new PackagerPolicyException("IntuneWinAppUtil.exe is not configured on this worker.");
        var dir = NewWorkspace(req.JobId);
        await _slots.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var content = await FetchSourceAsync(dir, req.SourceUrl, req.JobId, ct).ConfigureAwait(false);
            var setupFull = Path.Combine(content, req.SetupFile.Replace('/', Path.DirectorySeparatorChar));
            if (!File.Exists(setupFull)) throw new PackagerPolicyException("The setup file is not in the source.");
            // The tool lives at its admin-configured path, never inside the source folder, so it is not packaged.
            if (Path.GetFullPath(_intune.ExecutablePath).StartsWith(Path.GetFullPath(content) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                throw new PackagerPolicyException("IntuneWinAppUtil.exe must not be inside the source folder.");

            var output = Path.Combine(dir, "out"); Directory.CreateDirectory(output);
            var args = new[] { "-c", content, "-s", setupFull, "-o", output, "-q" };
            var run = await _runner.RunAsync(_intune.ExecutablePath, args, dir, TimeSpan.FromSeconds(_intune.ProcessTimeoutSeconds), ct).ConfigureAwait(false);
            if (run.TimedOut) throw new PackagerPolicyException("IntuneWinAppUtil.exe timed out.");
            if (run.ExitCode != 0) throw new PackagerPolicyException($"IntuneWinAppUtil.exe exited with code {run.ExitCode}.");
            var produced = Directory.EnumerateFiles(output, "*.intunewin").OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault()
                ?? throw new PackagerPolicyException("IntuneWinAppUtil.exe reported success but produced no .intunewin file.");

            var renamed = Path.Combine(output, req.OutputName!);
            if (!string.Equals(produced, renamed, StringComparison.OrdinalIgnoreCase)) File.Move(produced, renamed, overwrite: true);
            var info = new FileInfo(renamed);
            if (info.Length > _options.MaxSourceBytes) throw new PackagerPolicyException("The package exceeds the size limit.");
            string sha;
            await using (var fs = File.OpenRead(renamed)) sha = Convert.ToHexString(await SHA256.HashDataAsync(fs, ct).ConfigureAwait(false)).ToLowerInvariant();

            var upload = PackagerCommandPolicy.RequireAllowedUrl(req.UploadUrl, _options.AllowedServerHost, $"/api/win-packager-worker/{req.JobId}/output");
            await _transport.UploadAsync(upload, renamed, ct).ConfigureAwait(false);
            return new PackagerPackageResponse(req.OutputName!, info.Length, sha, _agentName);
        }
        finally { _slots.Release(); Cleanup(dir); }
    }
}
