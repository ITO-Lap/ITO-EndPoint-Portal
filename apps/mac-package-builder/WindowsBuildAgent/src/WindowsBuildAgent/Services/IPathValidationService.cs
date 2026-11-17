namespace WindowsBuildAgent.Services;

public sealed class PathValidationException : Exception
{
    public PathValidationException(string message) : base(message) { }
}

/// <summary>
/// Windows-side defense-in-depth counterpart to the Mac app's
/// WinGetValidators/PathValidator. Every relative path or filename coming
/// from a client request must be resolved and checked here before it ever
/// touches the filesystem or a process's ArgumentList. Never trust the
/// caller, even though the Mac client also validates before sending.
/// </summary>
public interface IPathValidationService
{
    /// <summary>
    /// Resolves <paramref name="relativeOrCandidatePath"/> against
    /// <paramref name="allowedRoot"/>, and throws <see cref="PathValidationException"/>
    /// if the result escapes the root, is a UNC path, is rooted outside the
    /// allowed root, or uses a reserved Windows device name for any path
    /// segment. Returns the canonical, validated full path.
    /// </summary>
    string ValidateAndResolve(string allowedRoot, string relativeOrCandidatePath);

    /// <summary>True if <paramref name="fileName"/> (no directory separators) is safe to use as-is.</summary>
    bool IsSafeFileName(string fileName);
}
