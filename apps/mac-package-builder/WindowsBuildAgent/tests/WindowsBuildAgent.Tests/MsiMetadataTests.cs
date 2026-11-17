using Microsoft.Extensions.Logging.Abstractions;
using WindowsBuildAgent.Services;
using Xunit;

namespace WindowsBuildAgent.Tests;

/// <summary>
/// MsiInspectionService derives silent install/uninstall command lines from
/// only the file path (no COM interop yet — see the TODO in
/// MsiInspectionService.InspectAsync), so these tests focus on that command
/// derivation and on honest "unknown" reporting for fields that would
/// require reading the MSI's Property table.
/// </summary>
public sealed class MsiMetadataTests
{
    private static MsiInspectionService CreateService() => new(NullLogger<MsiInspectionService>.Instance);

    [Fact]
    public async Task InspectAsync_MissingFile_ThrowsFileNotFound()
    {
        var service = CreateService();
        var missingPath = Path.Combine(Path.GetTempPath(), "does-not-exist-" + Guid.NewGuid().ToString("N") + ".msi");

        await Assert.ThrowsAsync<FileNotFoundException>(() => service.InspectAsync(missingPath, CancellationToken.None));
    }

    [Fact]
    public async Task InspectAsync_ProducesQuotedSilentInstallAndUninstallCommands()
    {
        var service = CreateService();
        var tempFile = Path.Combine(Path.GetTempPath(), "sample-" + Guid.NewGuid().ToString("N") + ".msi");
        await File.WriteAllTextAsync(tempFile, "not a real msi, just bytes for the test");

        try
        {
            var metadata = await service.InspectAsync(tempFile, CancellationToken.None);

            Assert.Contains($"\"{tempFile}\"", metadata.SilentInstallCommand);
            Assert.Contains("/qn", metadata.SilentInstallCommand);
            Assert.Contains("/norestart", metadata.SilentInstallCommand);
            Assert.StartsWith("msiexec.exe /i", metadata.SilentInstallCommand);

            Assert.Contains($"\"{tempFile}\"", metadata.SilentUninstallCommand);
            Assert.Contains("/qn", metadata.SilentUninstallCommand);
            Assert.StartsWith("msiexec.exe /x", metadata.SilentUninstallCommand);
        }
        finally
        {
            File.Delete(tempFile);
        }
    }

    [Fact]
    public async Task InspectAsync_WithoutComInterop_ReportsProductCodeAsUnknownRatherThanFakingIt()
    {
        var service = CreateService();
        var tempFile = Path.Combine(Path.GetTempPath(), "sample-" + Guid.NewGuid().ToString("N") + ".msi");
        await File.WriteAllTextAsync(tempFile, "not a real msi");

        try
        {
            var metadata = await service.InspectAsync(tempFile, CancellationToken.None);

            // Until Windows Installer COM interop is implemented, the
            // service must never fabricate a product code — it must be
            // explicit about not knowing it.
            Assert.Equal(string.Empty, metadata.ProductCode);
            Assert.Null(metadata.ProductVersion);
            Assert.Null(metadata.ProductName);
            Assert.Null(metadata.Manufacturer);
        }
        finally
        {
            File.Delete(tempFile);
        }
    }
}
