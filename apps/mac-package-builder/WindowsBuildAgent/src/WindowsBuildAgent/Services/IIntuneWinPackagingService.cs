namespace WindowsBuildAgent.Services;

public sealed class IntuneWinPackagingException : Exception
{
    public IntuneWinPackagingException(string message) : base(message) { }
    public IntuneWinPackagingException(string message, Exception inner) : base(message, inner) { }
}

/// <summary>
/// Wraps the admin-configured IntuneWinAppUtil.exe to produce a .intunewin
/// package from a validated source folder + setup file. The tool itself is
/// kept outside any per-job source folder (it lives at a fixed, admin-owned
/// path from configuration), and each invocation uses an isolated per-job
/// temp working directory that is cleaned up afterward.
/// </summary>
public interface IIntuneWinPackagingService
{
    /// <summary>
    /// Packages <paramref name="setupFileName"/> (relative to
    /// <paramref name="sourceFolder"/>) into a .intunewin file placed in
    /// <paramref name="outputFolder"/>. Both folders must already be
    /// validated by the caller via <see cref="IPathValidationService"/>.
    /// Returns the full path to the produced .intunewin file.
    /// </summary>
    Task<string> PackageAsync(
        string sourceFolder,
        string setupFileName,
        string outputFolder,
        CancellationToken cancellationToken);
}
