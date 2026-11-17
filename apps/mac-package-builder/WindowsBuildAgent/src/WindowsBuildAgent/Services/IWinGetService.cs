using WindowsBuildAgent.Models;

namespace WindowsBuildAgent.Services;

public sealed class WinGetValidationException : Exception
{
    public WinGetValidationException(string message) : base(message) { }
}

/// <summary>
/// Thin, safety-first wrapper over winget.exe. Every public method validates
/// its inputs against a strict allowlist regex before any value is placed
/// into a process ArgumentList. No method ever passes --ignore-security-hash,
/// --force past what is required for non-interactive scripted use, or any
/// flag outside a fixed allowlist.
/// </summary>
public interface IWinGetService
{
    Task<IReadOnlyList<WinGetPackageDto>> SearchAsync(string query, CancellationToken cancellationToken);

    Task<WinGetPackageDetailDto> ShowAsync(string packageId, string? version, CancellationToken cancellationToken);

    /// <summary>
    /// Downloads the installer for the given package/version/architecture
    /// into <paramref name="destinationDirectory"/> (already validated by the
    /// caller via <see cref="IPathValidationService"/>) and returns the path
    /// to the downloaded installer file.
    /// </summary>
    Task<string> DownloadAsync(
        string packageId,
        string version,
        string architecture,
        string scope,
        string destinationDirectory,
        CancellationToken cancellationToken);
}
