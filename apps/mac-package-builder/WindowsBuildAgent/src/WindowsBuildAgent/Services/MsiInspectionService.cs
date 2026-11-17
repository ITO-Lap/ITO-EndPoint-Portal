namespace WindowsBuildAgent.Services;

/// <summary>
/// Derives silent install/uninstall command lines and, where possible, basic
/// MSI metadata. Product code / product name / manufacturer extraction via
/// the MSI Property table requires Windows Installer COM interop
/// (see the interface doc comment); that piece is a clear TODO here rather
/// than faked, so callers get an honest "unknown" rather than a silently
/// wrong product code.
/// </summary>
public sealed class MsiInspectionService : IMsiInspectionService
{
    private readonly ILogger<MsiInspectionService> _logger;

    public MsiInspectionService(ILogger<MsiInspectionService> logger)
    {
        _logger = logger;
    }

    public Task<MsiMetadata> InspectAsync(string msiFilePath, CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("MSI inspection requires the Windows Installer engine and is only supported on Windows.");
        }

        if (!File.Exists(msiFilePath))
        {
            throw new FileNotFoundException("MSI file not found.", msiFilePath);
        }

        // TODO(full scope): open the MSI via Windows Installer COM interop
        // (WindowsInstaller.Installer / MsiOpenDatabaseW +
        // MsiDatabaseOpenViewW against the Property table) to read the real
        // ProductCode, ProductVersion, ProductName and Manufacturer
        // properties. That COM surface is out of scope for this pass; until
        // it lands, those fields are reported as null so callers cannot
        // mistake a stub value for verified data, while the silent
        // install/uninstall command lines below are still accurate since
        // they rely only on the well-known msiexec.exe switches plus the
        // file path, not on reading the MSI's internal tables.
        _logger.LogInformation(
            "MSI property-table inspection is not yet implemented (requires Windows Installer COM interop); returning command lines only for {Path}",
            msiFilePath);

        var quotedPath = $"\"{msiFilePath}\"";
        var silentInstall = $"msiexec.exe /i {quotedPath} /qn /norestart";
        // Uninstall-by-path is supported by msiexec via /x with the .msi
        // path (falls back to product-code based uninstall once the COM
        // interop above supplies a verified ProductCode).
        var silentUninstall = $"msiexec.exe /x {quotedPath} /qn /norestart";

        var metadata = new MsiMetadata(
            ProductCode: string.Empty,
            ProductVersion: null,
            ProductName: null,
            Manufacturer: null,
            SilentInstallCommand: silentInstall,
            SilentUninstallCommand: silentUninstall);

        return Task.FromResult(metadata);
    }
}
