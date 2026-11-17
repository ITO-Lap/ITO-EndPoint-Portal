using System.IO.Compression;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using WindowsBuildAgent.Endpoints;
using WindowsBuildAgent.Models;
using WindowsBuildAgent.Services;
using WindowsBuildAgent.Tests.Fakes;
using Xunit;

namespace WindowsBuildAgent.Tests;

/// <summary>Command policy + validation/packaging flow of the ITO Windows Package Builder contract. No real process is run.</summary>
public sealed class PackagerCommandPolicyTests
{
    private const string Sys = "/sys";
    private static ResolvedCommand R(string cmd, string setup = "app.exe", bool un = false) => PackagerCommandPolicy.Resolve(cmd, setup, "/work/content", un, Sys);

    [Fact]
    public void Msiexec_ResolvesToSystemMsiexecWithArgumentList()
    {
        var r = R("msiexec /i \"app.msi\" /qn /norestart", "app.msi");
        Assert.Equal(Path.Combine(Sys, "msiexec.exe"), r.Executable);
        Assert.Equal(new[] { "/i", "app.msi", "/qn", "/norestart" }, r.Arguments);
    }

    [Fact]
    public void SetupFile_ResolvesInsideContentFolder_IncludingSubfolders()
    {
        Assert.Equal(Path.Combine("/work/content", "app.exe"), R("\"app.exe\" /S").Executable);
        var sub = R(".\\bundle\\setup.exe /S", "bundle/setup.exe");
        Assert.Equal(Path.Combine("/work/content", "bundle", "setup.exe"), sub.Executable);
    }

    [Fact]
    public void GeneratedScriptWrapper_RunsPowerShellWithFixedArguments()
    {
        var r = R("powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\install.ps1", "a.msix");
        Assert.EndsWith("powershell.exe", r.Executable);
        Assert.Equal(new[] { "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", Path.Combine("/work/content", "install.ps1") }, r.Arguments);
    }

    [Theory]
    [InlineData("app.exe /S & calc.exe")]
    [InlineData("app.exe /S | more")]
    [InlineData("app.exe; whoami")]
    [InlineData("app.exe `id`")]
    [InlineData("app.exe $(id)")]
    [InlineData("app.exe > out.txt")]
    [InlineData("cmd /c app.exe")]
    [InlineData("powershell -Command \"iwr evil\"")]
    [InlineData("C:\\Windows\\System32\\calc.exe")]
    [InlineData("\"C:\\Program Files\\App\\unins000.exe\" /S")] // an uninstaller path is not allowed for INSTALL
    [InlineData("app.exe\r\ncalc")]
    [InlineData("\"unterminated")]
    [InlineData("")]
    public void Install_RejectsAnythingElse(string cmd) => Assert.Throws<PackagerPolicyException>(() => R(cmd));

    [Fact]
    public void Uninstall_AllowsOnlyAbsoluteUninstallers()
    {
        Assert.Equal("C:\\Program Files\\App\\unins000.exe", R("\"C:\\Program Files\\App\\unins000.exe\" /VERYSILENT", un: true).Executable);
        Assert.Throws<PackagerPolicyException>(() => R("\"C:\\Tools\\mimikatz.exe\"", un: true));
        Assert.Throws<PackagerPolicyException>(() => R("unins000.exe /S", un: true)); // not absolute
    }

    [Fact]
    public void MsiexecWithAPath_IsRejected() => Assert.Throws<PackagerPolicyException>(() => R("C:\\evil\\msiexec.exe /i x"));

    [Theory]
    [InlineData("setup.exe", true)] [InlineData("a/b/setup.msi", true)] [InlineData("../x.exe", false)] [InlineData("a/../x.exe", false)]
    [InlineData("/etc/x.exe", false)] [InlineData("x.bat", false)] [InlineData("a;b.exe", false)] [InlineData("", false)]
    public void SetupFileValidation(string name, bool ok) => Assert.Equal(ok, PackagerCommandPolicy.IsValidSetupFile(name));

    [Fact]
    public void JobIds_MustBeGuids()
    {
        Assert.True(PackagerCommandPolicy.IsValidJobId(Guid.NewGuid().ToString()));
        Assert.False(PackagerCommandPolicy.IsValidJobId("../../etc"));
        Assert.False(PackagerCommandPolicy.IsValidJobId(null));
    }

    [Theory]
    [InlineData("https://ito.example/api/win-packager-worker/J/source?exp=1&sig=2", true)]
    [InlineData("http://ito.example/api/win-packager-worker/J/source", false)]            // not https
    [InlineData("https://evil.example/api/win-packager-worker/J/source", false)]          // other host
    [InlineData("https://ito.example/other/path", false)]                                  // other path
    [InlineData("https://user:pw@ito.example/api/win-packager-worker/J/source", false)]   // credentials in URL
    [InlineData("https://ito.example.evil.com/api/win-packager-worker/J/source", false)]
    public void TransferUrls_AreRestrictedToTheItoHost(string url, bool ok)
    {
        if (ok) Assert.NotNull(PackagerCommandPolicy.RequireAllowedUrl(url, "ito.example", "/api/win-packager-worker/J/source"));
        else Assert.Throws<PackagerPolicyException>(() => PackagerCommandPolicy.RequireAllowedUrl(url, "ito.example", "/api/win-packager-worker/J/source"));
    }
}

public sealed class PackagerServiceTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "wba-packager-" + Guid.NewGuid().ToString("N"));
    private readonly string _tool;
    private readonly string _jobId = Guid.NewGuid().ToString();

    public PackagerServiceTests()
    {
        Directory.CreateDirectory(_root);
        _tool = Path.Combine(_root, "tools", "IntuneWinAppUtil.exe");
        Directory.CreateDirectory(Path.GetDirectoryName(_tool)!);
        File.WriteAllText(_tool, "fake");
    }
    public void Dispose() { try { Directory.Delete(_root, true); } catch { } }

    private sealed class FakeTransport : IPackagerTransport
    {
        public Action<string> OnDownload = _ => { };
        public List<Uri> Downloads { get; } = new(); public List<(Uri Url, string File, long Size)> Uploads { get; } = new();
        public Task DownloadAsync(Uri url, string dest, long max, CancellationToken ct) { Downloads.Add(url); OnDownload(dest); return Task.CompletedTask; }
        public Task UploadAsync(Uri url, string src, CancellationToken ct) { Uploads.Add((url, src, new FileInfo(src).Length)); return Task.CompletedTask; }
    }

    private sealed class ActionRunner : IProcessRunner
    {
        public List<FakeProcessRunner.Invocation> Calls { get; } = new();
        public Func<string, IReadOnlyList<string>, ProcessRunResult> Handler = (_, _) => new(0, "", "", false);
        public Task<ProcessRunResult> RunAsync(string exe, IReadOnlyList<string> args, string? wd, TimeSpan t, CancellationToken ct)
        { Calls.Add(new(exe, args, wd)); return Task.FromResult(Handler(exe, args)); }
    }

    private static void MakeZip(string path, params (string Name, string Content)[] entries)
    {
        using var zip = ZipFile.Open(path, ZipArchiveMode.Create);
        foreach (var (name, content) in entries)
        {
            var e = zip.CreateEntry(name);
            using var w = new StreamWriter(e.Open()); w.Write(content);
        }
    }

    private PackagerService Svc(IProcessRunner runner, IPackagerTransport transport, string host = "ito.example") => new(
        runner, transport,
        Options.Create(new PackagerOptions { AllowedServerHost = host, WorkspaceRoot = Path.Combine(_root, "ws"), StepTimeoutMinutes = 1 }),
        Options.Create(new IntuneWinAppUtilOptions { ExecutablePath = _tool, ProcessTimeoutSeconds = 30 }),
        Options.Create(new AgentInfoOptions { AgentName = "WIN-TEST" }),
        Options.Create(new JobStoreOptions { RootDirectory = _root }), "/sys");

    private string Src(string purpose = "source") => $"https://ito.example/api/win-packager-worker/{_jobId}/{purpose}?exp=1&sig=abc";
    private PackagerValidateRequest VReq(string install = "msiexec /i \"app.msi\" /qn /norestart", string uninstall = "msiexec /x \"{GUID}\" /qn /norestart") =>
        new(_jobId, "app.msi", install, uninstall, "Write-Output 'Detected'\nexit 0", new PackagerSourceInfo("x", 1), Src());
    private FakeTransport GoodSource() => new() { OnDownload = dest => MakeZip(dest, ("app.msi", "data")) };
    private int WorkspaceCount() => Directory.Exists(Path.Combine(_root, "ws")) ? Directory.GetDirectories(Path.Combine(_root, "ws")).Length : 0;

    [Fact]
    public async Task Validate_RunsInstallDetectUninstallDetect_WithArgumentLists_AndCleansUp()
    {
        var runner = new ActionRunner();
        var detects = 0;
        runner.Handler = (exe, args) =>
        {
            if (exe.EndsWith("powershell.exe")) return ++detects == 1 ? new(0, "Detected", "", false) : new(1, "", "", false);
            return new(0, "ok", "", false);
        };
        var res = await Svc(runner, GoodSource()).ValidateAsync(VReq(), default);

        Assert.Equal(new[] { "install", "detect-after-install", "uninstall", "detect-after-uninstall" }, res.Steps.Select(s => s.Name));
        Assert.All(res.Steps, s => Assert.Equal("pass", s.Status));
        Assert.Equal("WIN-TEST", res.WorkerName);
        Assert.Equal(4, runner.Calls.Count);
        Assert.Equal(Path.Combine("/sys", "msiexec.exe"), runner.Calls[0].ExecutablePath);
        Assert.Equal(new[] { "/i", "app.msi", "/qn", "/norestart" }, runner.Calls[0].Arguments);
        Assert.Equal(new[] { "/x", "{GUID}", "/qn", "/norestart" }, runner.Calls[2].Arguments);
        Assert.Contains("-File", runner.Calls[1].Arguments);
        Assert.Equal(0, WorkspaceCount());
    }

    [Fact]
    public async Task Validate_StopsAfterAFailedInstall_AndSkipsTheRest()
    {
        var runner = new ActionRunner { Handler = (_, _) => new(1603, "", "fatal", false) };
        var res = await Svc(runner, GoodSource()).ValidateAsync(VReq(), default);
        Assert.Equal(new[] { "fail", "skipped", "skipped", "skipped" }, res.Steps.Select(s => s.Status));
        Assert.Equal(1603, res.Steps[0].ExitCode);
        Assert.Equal("fatal", res.Steps[0].Stderr);
        Assert.Single(runner.Calls);
    }

    [Fact]
    public async Task Validate_FailsWhenTheAppIsStillDetectedAfterUninstall()
    {
        var runner = new ActionRunner { Handler = (exe, _) => exe.EndsWith("powershell.exe") ? new(0, "Detected", "", false) : new(0, "", "", false) };
        var res = await Svc(runner, GoodSource()).ValidateAsync(VReq(), default);
        Assert.Equal("pass", res.Steps[2].Status);
        Assert.Equal("fail", res.Steps[3].Status);
    }

    [Fact]
    public async Task Validate_FailsWhenDetectionDoesNotSucceedAfterInstall()
    {
        var runner = new ActionRunner { Handler = (exe, _) => exe.EndsWith("powershell.exe") ? new(1, "", "", false) : new(0, "", "", false) };
        var res = await Svc(runner, GoodSource()).ValidateAsync(VReq(), default);
        Assert.Equal(new[] { "pass", "fail", "skipped", "skipped" }, res.Steps.Select(s => s.Status));
    }

    [Fact]
    public async Task Validate_FlagsRebootAndTimeout()
    {
        var runner = new ActionRunner { Handler = (_, _) => new(3010, "", "", false) };
        var res = await Svc(runner, GoodSource()).ValidateAsync(VReq(), default);
        Assert.True(res.Steps[0].RebootIndicated);
        runner.Handler = (_, _) => new(-1, "", "", true);
        var timed = await Svc(runner, GoodSource()).ValidateAsync(VReq(), default);
        Assert.Equal("fail", timed.Steps[0].Status);
        Assert.Contains("timed out", timed.Steps[0].Stderr);
    }

    [Fact]
    public async Task Validate_RejectsABadUninstallCommandBeforeInstallingAnything()
    {
        var runner = new ActionRunner();
        await Assert.ThrowsAsync<PackagerPolicyException>(() => Svc(runner, GoodSource()).ValidateAsync(VReq(uninstall: "cmd /c del /q C:\\*"), default));
        Assert.Empty(runner.Calls);
        Assert.Equal(0, WorkspaceCount());
    }

    [Fact]
    public async Task Validate_RefusesAZipSlipSource_AndRunsNothing()
    {
        var runner = new ActionRunner();
        var transport = new FakeTransport { OnDownload = d => MakeZip(d, ("../evil.exe", "x"), ("app.msi", "y")) };
        await Assert.ThrowsAsync<PackagerPolicyException>(() => Svc(runner, transport).ValidateAsync(VReq(), default));
        Assert.Empty(runner.Calls);
        Assert.False(File.Exists(Path.Combine(_root, "ws", "evil.exe")));
    }

    [Fact]
    public async Task Validate_RefusesDisallowedHostsAndBadIds_WithoutTouchingTheNetwork()
    {
        var transport = GoodSource();
        await Assert.ThrowsAsync<PackagerPolicyException>(() => Svc(new ActionRunner(), transport, host: "other.example").ValidateAsync(VReq(), default));
        await Assert.ThrowsAsync<PackagerPolicyException>(() => Svc(new ActionRunner(), transport).ValidateAsync(VReq() with { JobId = "../../x" }, default));
        await Assert.ThrowsAsync<PackagerPolicyException>(() => Svc(new ActionRunner(), transport).ValidateAsync(VReq() with { SetupFile = "../app.msi" }, default));
        Assert.Empty(transport.Downloads);
    }

    [Fact]
    public async Task Package_RunsIntuneWinAppUtilFromOutsideTheSource_AndUploadsWithMatchingHash()
    {
        var runner = new ActionRunner();
        runner.Handler = (_, args) => { File.WriteAllBytes(Path.Combine(args[args.ToList().IndexOf("-o") + 1], "app.intunewin"), new byte[] { 0x50, 0x4b, 3, 4, 9 }); return new(0, "", "", false); };
        var transport = GoodSource();
        var res = await Svc(runner, transport).PackageAsync(new PackagerPackageRequest(_jobId, "app.msi", "App-1.0-x64.intunewin", Src(), Src("output")), default);

        var call = Assert.Single(runner.Calls);
        Assert.Equal(_tool, call.ExecutablePath);
        var a = call.Arguments;
        Assert.Equal(new[] { "-c", "-s", "-o", "-q" }, new[] { a[0], a[2], a[4], a[6] });
        Assert.EndsWith("content", a[1]);
        Assert.False(a[1].StartsWith(Path.GetDirectoryName(_tool)!)); // tool not inside the packaged source
        Assert.Equal("App-1.0-x64.intunewin", res.FileName);
        Assert.Equal(5, res.SizeBytes);
        Assert.Equal(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(new byte[] { 0x50, 0x4b, 3, 4, 9 })).ToLowerInvariant(), res.Sha256);
        var up = Assert.Single(transport.Uploads);
        Assert.Contains($"/{_jobId}/output", up.Url.AbsolutePath);
        Assert.Equal(5, up.Size);
        Assert.Equal(0, WorkspaceCount());
    }

    [Fact]
    public async Task Package_FailsHonestly_WhenTheToolFailsOrProducesNothing()
    {
        var failing = new ActionRunner { Handler = (_, _) => new(5, "", "boom", false) };
        await Assert.ThrowsAsync<PackagerPolicyException>(() => Svc(failing, GoodSource()).PackageAsync(new(_jobId, "app.msi", "A.intunewin", Src(), Src("output")), default));
        var empty = new ActionRunner();
        var t = GoodSource();
        await Assert.ThrowsAsync<PackagerPolicyException>(() => Svc(empty, t).PackageAsync(new(_jobId, "app.msi", "A.intunewin", Src(), Src("output")), default));
        Assert.Empty(t.Uploads);
    }

    [Theory]
    [InlineData("../x.intunewin")] [InlineData("x.exe")] [InlineData("a b.intunewin")] [InlineData("")]
    public async Task Package_RejectsBadOutputNames(string name) =>
        await Assert.ThrowsAsync<PackagerPolicyException>(() => Svc(new ActionRunner(), GoodSource()).PackageAsync(new(_jobId, "app.msi", name, Src(), Src("output")), default));

    [Fact]
    public async Task Package_RefusesAnUploadUrlForAnotherJob()
    {
        var runner = new ActionRunner();
        runner.Handler = (_, args) => { File.WriteAllBytes(Path.Combine(args[args.ToList().IndexOf("-o") + 1], "a.intunewin"), new byte[] { 1 }); return new(0, "", "", false); };
        var other = $"https://ito.example/api/win-packager-worker/{Guid.NewGuid()}/output?exp=1&sig=a";
        var t = GoodSource();
        await Assert.ThrowsAsync<PackagerPolicyException>(() => Svc(runner, t).PackageAsync(new(_jobId, "app.msi", "A.intunewin", Src(), other), default));
        Assert.Empty(t.Uploads);
    }
}

public sealed class PackagerRouteTests
{
    [Fact]
    public void PackagerRoutes_AreTypedAndAuthorized_AndContainNoGenericExecSurface()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddRouting();
        builder.Services.AddSingleton(new Moq.Mock<IPackagerService>().Object);
        using var app = builder.Build();
        app.MapPackagerEndpoints();
        var endpoints = ((IEndpointRouteBuilder)app).DataSources.SelectMany(d => d.Endpoints).OfType<RouteEndpoint>().ToList();
        Assert.Equal(new[] { "/package", "/validate" }, endpoints.Select(e => e.RoutePattern.RawText!).OrderBy(x => x));
        Assert.All(endpoints, e => Assert.Contains(e.Metadata, m => m is Microsoft.AspNetCore.Authorization.IAuthorizeData));
        foreach (var frag in new[] { "exec", "command", "cmd", "shell", "run", "eval", "script", "powershell", "invoke" })
            Assert.All(endpoints, e => Assert.DoesNotContain(frag, e.RoutePattern.RawText!, StringComparison.OrdinalIgnoreCase));
    }
}
