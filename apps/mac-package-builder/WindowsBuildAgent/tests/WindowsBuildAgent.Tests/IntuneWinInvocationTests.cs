using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using WindowsBuildAgent.Services;
using WindowsBuildAgent.Tests.Fakes;
using Xunit;

namespace WindowsBuildAgent.Tests;

/// <summary>
/// IntuneWinPackagingService must build the correct ArgumentList for
/// IntuneWinAppUtil.exe (-c/-s/-o/-q), always run it in an isolated temp
/// working directory distinct from the source/output folders, never run on
/// non-Windows, and never invoke it with an unsanitized path. No test here
/// invokes a real IntuneWinAppUtil.exe — everything goes through
/// FakeProcessRunner.
/// </summary>
public sealed class IntuneWinInvocationTests : IDisposable
{
    private readonly string _jobRoot = Path.Combine(Path.GetTempPath(), "wba-intune-root-" + Guid.NewGuid().ToString("N"));
    private readonly string _fakeToolPath;

    public IntuneWinInvocationTests()
    {
        Directory.CreateDirectory(_jobRoot);
        _fakeToolPath = Path.Combine(_jobRoot, "IntuneWinAppUtil.exe");
        File.WriteAllText(_fakeToolPath, "fake tool binary");
    }

    private IntuneWinPackagingService CreateService(FakeProcessRunner runner, IPathValidationService? validator = null) =>
        new(
            runner,
            validator ?? new PathValidationService(),
            Options.Create(new IntuneWinAppUtilOptions { ExecutablePath = _fakeToolPath, ProcessTimeoutSeconds = 60 }),
            Options.Create(new JobStoreOptions { RootDirectory = _jobRoot, MaxConcurrentJobs = 3 }),
            NullLogger<IntuneWinPackagingService>.Instance);

    private (string SourceDir, string OutputDir) CreateSourceAndOutputFolders(string setupFileName)
    {
        var source = Path.Combine(_jobRoot, "source-" + Guid.NewGuid().ToString("N"));
        var output = Path.Combine(_jobRoot, "output-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(source);
        Directory.CreateDirectory(output);
        File.WriteAllText(Path.Combine(source, setupFileName), "fake installer bytes");
        return (source, output);
    }

    [Fact]
    public async Task PackageAsync_BuildsCorrectArgumentListForIntuneWinAppUtil()
    {
        var runner = new FakeProcessRunner();
        var (source, output) = CreateSourceAndOutputFolders("setup.exe");
        // Simulate the tool "producing" a .intunewin file as a side effect.
        File.WriteAllText(Path.Combine(output, "setup.intunewin"), "fake package");

        var service = CreateService(runner);
        var produced = await service.PackageAsync(source, "setup.exe", output, CancellationToken.None);

        var invocation = Assert.Single(runner.Invocations);
        Assert.Equal(_fakeToolPath, invocation.ExecutablePath);

        var args = invocation.Arguments;
        Assert.Equal("-c", args[0]);
        Assert.Equal(Path.GetFullPath(source), args[1]);
        Assert.Equal("-s", args[2]);
        Assert.Equal(Path.Combine(Path.GetFullPath(source), "setup.exe"), args[3]);
        Assert.Equal("-o", args[4]);
        Assert.Equal(Path.GetFullPath(output), args[5]);
        Assert.Equal("-q", args[6]);

        Assert.EndsWith(".intunewin", produced, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PackageAsync_RunsInAnIsolatedTempWorkingDirectory_DistinctFromSourceAndOutput()
    {
        var runner = new FakeProcessRunner();
        var (source, output) = CreateSourceAndOutputFolders("setup.exe");
        File.WriteAllText(Path.Combine(output, "setup.intunewin"), "fake package");

        var service = CreateService(runner);
        await service.PackageAsync(source, "setup.exe", output, CancellationToken.None);

        var invocation = Assert.Single(runner.Invocations);
        Assert.NotNull(invocation.WorkingDirectory);
        Assert.NotEqual(Path.GetFullPath(source), invocation.WorkingDirectory);
        Assert.NotEqual(Path.GetFullPath(output), invocation.WorkingDirectory);
        Assert.NotEqual(Path.GetDirectoryName(_fakeToolPath), invocation.WorkingDirectory);
    }

    [Fact]
    public async Task PackageAsync_CleansUpTempWorkingDirectoryAfterCompletion()
    {
        var runner = new FakeProcessRunner();
        var (source, output) = CreateSourceAndOutputFolders("setup.exe");
        File.WriteAllText(Path.Combine(output, "setup.intunewin"), "fake package");

        var service = CreateService(runner);
        await service.PackageAsync(source, "setup.exe", output, CancellationToken.None);

        var invocation = Assert.Single(runner.Invocations);
        Assert.False(Directory.Exists(invocation.WorkingDirectory));
    }

    [Fact]
    public async Task PackageAsync_RejectsUnsafeSetupFileName_AndNeverInvokesProcess()
    {
        var runner = new FakeProcessRunner();
        var (source, output) = CreateSourceAndOutputFolders("setup.exe");

        var service = CreateService(runner);

        await Assert.ThrowsAsync<IntuneWinPackagingException>(() =>
            service.PackageAsync(source, "..\\..\\evil.exe", output, CancellationToken.None));

        Assert.Empty(runner.Invocations);
    }

    [Fact]
    public async Task PackageAsync_RejectsSourceFolderOutsideJobRoot()
    {
        var runner = new FakeProcessRunner();
        var outsideSource = Directory.CreateTempSubdirectory().FullName;
        File.WriteAllText(Path.Combine(outsideSource, "setup.exe"), "bytes");
        var output = Path.Combine(_jobRoot, "output-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(output);

        var service = CreateService(runner);

        try
        {
            await Assert.ThrowsAsync<PathValidationException>(() =>
                service.PackageAsync(outsideSource, "setup.exe", output, CancellationToken.None));

            Assert.Empty(runner.Invocations);
        }
        finally
        {
            Directory.Delete(outsideSource, recursive: true);
        }
    }

    [Fact]
    public async Task PackageAsync_ThrowsIfToolExecutableIsMissing()
    {
        var runner = new FakeProcessRunner();
        var (source, output) = CreateSourceAndOutputFolders("setup.exe");

        var service = new IntuneWinPackagingService(
            runner,
            new PathValidationService(),
            Options.Create(new IntuneWinAppUtilOptions { ExecutablePath = Path.Combine(_jobRoot, "does-not-exist.exe") }),
            Options.Create(new JobStoreOptions { RootDirectory = _jobRoot, MaxConcurrentJobs = 3 }),
            NullLogger<IntuneWinPackagingService>.Instance);

        await Assert.ThrowsAsync<IntuneWinPackagingException>(() =>
            service.PackageAsync(source, "setup.exe", output, CancellationToken.None));

        Assert.Empty(runner.Invocations);
    }

    public void Dispose()
    {
        if (Directory.Exists(_jobRoot))
        {
            try { Directory.Delete(_jobRoot, recursive: true); } catch { /* best effort cleanup */ }
        }
    }
}
