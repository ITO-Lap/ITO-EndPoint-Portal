namespace WindowsBuildAgent.Services;

public sealed record MsiMetadata(
    string ProductCode,
    string? ProductVersion,
    string? ProductName,
    string? Manufacturer,
    string SilentInstallCommand,
    string SilentUninstallCommand
);

/// <summary>
/// Derives MSI product metadata and the standard silent install/uninstall
/// command lines for a downloaded .msi file.
///
/// Full production quality requires reading the MSI's Property table via
/// Windows Installer COM interop (Microsoft.Deployment.WindowsInstaller / the
/// raw <c>WindowsInstaller.Installer</c> COM object,
/// <c>MsiOpenDatabase</c>/<c>MsiOpenPackage</c> Win32 APIs, or the
/// <c>WindowsInstaller.dll</c> P/Invoke surface). That COM interop is
/// intentionally out of scope for this pass — see the TODO in
/// <see cref="MsiInspectionService.InspectAsync"/> — but the interface below
/// is real and independently testable so a future pass can slot in a COM
/// implementation without touching any caller.
/// </summary>
public interface IMsiInspectionService
{
    Task<MsiMetadata> InspectAsync(string msiFilePath, CancellationToken cancellationToken);
}
