using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using WindowsBuildAgent.Services;
using WindowsBuildAgent.Tests.Fakes;
using Xunit;

namespace WindowsBuildAgent.Tests;

/// <summary>
/// WinGetService must reject package ids/versions/architectures/scopes that
/// fail its allowlist before ever forwarding them to IProcessRunner. Every
/// assertion here also checks that, on rejection, the fake process runner
/// was never invoked at all — i.e. unvalidated input never reaches argv.
/// </summary>
public sealed class ArgumentValidationTests
{
    private static WinGetService CreateService(FakeProcessRunner runner) =>
        new(runner, Options.Create(new WinGetOptions { ExecutablePath = "winget.exe", ProcessTimeoutSeconds = 30 }), NullLogger<WinGetService>.Instance);

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("Publisher; rm -rf /")]
    [InlineData("Publisher.Product && calc.exe")]
    [InlineData("Publisher.Product`whoami`")]
    [InlineData("../../etc/passwd")]
    [InlineData("Publisher.Product\n--ignore-security-hash")]
    public async Task ShowAsync_RejectsInvalidPackageId_AndNeverInvokesProcess(string maliciousId)
    {
        var runner = new FakeProcessRunner();
        var service = CreateService(runner);

        await Assert.ThrowsAsync<WinGetValidationException>(() => service.ShowAsync(maliciousId, null, CancellationToken.None));

        Assert.Empty(runner.Invocations);
    }

    [Theory]
    [InlineData("1.0.0; shutdown /s")]
    [InlineData("")]
    [InlineData("1.0.0 --ignore-security-hash")]
    public async Task DownloadAsync_RejectsInvalidVersion_AndNeverInvokesProcess(string maliciousVersion)
    {
        var runner = new FakeProcessRunner();
        var service = CreateService(runner);
        var tempDir = Directory.CreateTempSubdirectory().FullName;

        try
        {
            await Assert.ThrowsAsync<WinGetValidationException>(() =>
                service.DownloadAsync("Publisher.Product", maliciousVersion, "x64", "user", tempDir, CancellationToken.None));

            Assert.Empty(runner.Invocations);
        }
        finally
        {
            Directory.Delete(tempDir, recursive: true);
        }
    }

    [Theory]
    [InlineData("x64; calc")]
    [InlineData("mips")]
    [InlineData("")]
    public async Task DownloadAsync_RejectsInvalidArchitecture_AndNeverInvokesProcess(string architecture)
    {
        var runner = new FakeProcessRunner();
        var service = CreateService(runner);
        var tempDir = Directory.CreateTempSubdirectory().FullName;

        try
        {
            await Assert.ThrowsAsync<WinGetValidationException>(() =>
                service.DownloadAsync("Publisher.Product", "1.0.0", architecture, "user", tempDir, CancellationToken.None));

            Assert.Empty(runner.Invocations);
        }
        finally
        {
            Directory.Delete(tempDir, recursive: true);
        }
    }

    [Theory]
    [InlineData("admin")]
    [InlineData("machine; calc")]
    [InlineData("")]
    public async Task DownloadAsync_RejectsInvalidScope_AndNeverInvokesProcess(string scope)
    {
        var runner = new FakeProcessRunner();
        var service = CreateService(runner);
        var tempDir = Directory.CreateTempSubdirectory().FullName;

        try
        {
            await Assert.ThrowsAsync<WinGetValidationException>(() =>
                service.DownloadAsync("Publisher.Product", "1.0.0", "x64", scope, tempDir, CancellationToken.None));

            Assert.Empty(runner.Invocations);
        }
        finally
        {
            Directory.Delete(tempDir, recursive: true);
        }
    }

    [Fact]
    public async Task DownloadAsync_NeverPassesIgnoreSecurityHashFlag_OnValidInput()
    {
        var runner = new FakeProcessRunner();
        var service = CreateService(runner);
        var tempDir = Directory.CreateTempSubdirectory().FullName;

        try
        {
            // Simulate a successful winget run by dropping a fake installer
            // into the destination directory before invocation completes.
            File.WriteAllText(Path.Combine(tempDir, "installer.exe"), "fake");

            await service.DownloadAsync("Publisher.Product", "1.0.0", "x64", "user", tempDir, CancellationToken.None);

            var invocation = Assert.Single(runner.Invocations);
            Assert.DoesNotContain("--ignore-security-hash", invocation.Arguments);
            Assert.Contains("--id", invocation.Arguments);
            Assert.Contains("Publisher.Product", invocation.Arguments);
        }
        finally
        {
            Directory.Delete(tempDir, recursive: true);
        }
    }

    [Fact]
    public void ValidatePackageId_AcceptsWellFormedIds()
    {
        WinGetService.ValidatePackageId("Microsoft.VisualStudioCode");
        WinGetService.ValidatePackageId("7zip.7zip");
        WinGetService.ValidatePackageId("Publisher.Product-Sub_2");
    }
}
