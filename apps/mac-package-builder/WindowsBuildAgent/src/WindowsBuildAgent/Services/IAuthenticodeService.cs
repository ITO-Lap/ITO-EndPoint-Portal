namespace WindowsBuildAgent.Services;

public enum SignatureStatus
{
    Valid,
    NotSigned,
    Untrusted,
    Expired,
    HashMismatch,
    Unknown
}

public sealed record AuthenticodeResult(
    SignatureStatus Status,
    string? PublisherName,
    string? CertificateSubject,
    DateTimeOffset? SigningTimestampUtc,
    DateTimeOffset? CertificateExpiryUtc,
    string? FileVersion,
    string? ProductVersion,
    string Sha256ActualHex
);

/// <summary>
/// Authenticode signature and certificate inspection for a downloaded
/// installer file. Implemented with WinVerifyTrust (via P/Invoke) and
/// System.Security.Cryptography.X509Certificates / FileVersionInfo, all of
/// which are Windows-only APIs. Any call on a non-Windows OS throws
/// <see cref="PlatformNotSupportedException"/> rather than silently
/// returning a fabricated "trusted" result.
/// </summary>
public interface IAuthenticodeService
{
    Task<AuthenticodeResult> InspectAsync(string filePath, CancellationToken cancellationToken);
}
