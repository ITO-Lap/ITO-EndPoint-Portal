using System.Text.RegularExpressions;

namespace WindowsBuildAgent.Services;

/// <summary>
/// Canonicalizes and contains paths within an allowed root directory.
/// Rejects:
///  - ".." traversal segments (checked both textually and after resolution)
///  - UNC paths ("\\server\share\...")
///  - absolute paths that resolve outside the allowed root
///  - reserved Windows device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) in
///    any path segment, with or without an extension
/// </summary>
public sealed partial class PathValidationService : IPathValidationService
{
    private static readonly HashSet<string> ReservedNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
    };

    [GeneratedRegex(@"^[A-Za-z0-9._\-]+$")]
    private static partial Regex SafeFileNameRegex();

    public string ValidateAndResolve(string allowedRoot, string relativeOrCandidatePath)
    {
        if (string.IsNullOrWhiteSpace(allowedRoot))
        {
            throw new PathValidationException("Allowed root must not be empty.");
        }

        if (string.IsNullOrWhiteSpace(relativeOrCandidatePath))
        {
            throw new PathValidationException("Path must not be empty.");
        }

        // Reject UNC paths outright before any Path.* normalization, since
        // Path.GetFullPath will happily "resolve" a UNC path.
        if (relativeOrCandidatePath.StartsWith(@"\\", StringComparison.Ordinal) ||
            relativeOrCandidatePath.StartsWith("//", StringComparison.Ordinal))
        {
            throw new PathValidationException("UNC paths are not permitted.");
        }

        // Reject explicit traversal segments textually first (defense in
        // depth even though GetFullPath below would also neutralize them).
        var segments = relativeOrCandidatePath.Split(['\\', '/'], StringSplitOptions.RemoveEmptyEntries);
        foreach (var segment in segments)
        {
            if (segment == "..")
            {
                throw new PathValidationException("Path traversal ('..') is not permitted.");
            }

            ThrowIfReservedName(segment);
        }

        var canonicalRoot = Path.GetFullPath(allowedRoot);
        // Ensure the root comparison is anchored on a directory-separator
        // boundary so "C:\jobs-evil" is not treated as inside "C:\jobs".
        var rootWithSeparator = canonicalRoot.EndsWith(Path.DirectorySeparatorChar)
            ? canonicalRoot
            : canonicalRoot + Path.DirectorySeparatorChar;

        var candidateFullPath = Path.IsPathRooted(relativeOrCandidatePath)
            ? Path.GetFullPath(relativeOrCandidatePath)
            : Path.GetFullPath(Path.Combine(canonicalRoot, relativeOrCandidatePath));

        if (Path.IsPathRooted(relativeOrCandidatePath) &&
            !candidateFullPath.Equals(canonicalRoot, StringComparison.OrdinalIgnoreCase) &&
            !candidateFullPath.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase))
        {
            throw new PathValidationException("Absolute paths outside the allowed root are not permitted.");
        }

        if (!candidateFullPath.Equals(canonicalRoot, StringComparison.OrdinalIgnoreCase) &&
            !candidateFullPath.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase))
        {
            throw new PathValidationException("Resolved path escapes the allowed root directory.");
        }

        return candidateFullPath;
    }

    public bool IsSafeFileName(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName)) return false;
        if (fileName.Length > 255) return false;
        if (!SafeFileNameRegex().IsMatch(fileName)) return false;

        var nameWithoutExtension = Path.GetFileNameWithoutExtension(fileName);
        if (ReservedNames.Contains(nameWithoutExtension)) return false;

        return true;
    }

    private static void ThrowIfReservedName(string segment)
    {
        var nameWithoutExtension = Path.GetFileNameWithoutExtension(segment);
        var candidate = string.IsNullOrEmpty(nameWithoutExtension) ? segment : nameWithoutExtension;
        if (ReservedNames.Contains(candidate))
        {
            throw new PathValidationException($"Reserved device name is not permitted in a path segment: {segment}");
        }
    }
}
