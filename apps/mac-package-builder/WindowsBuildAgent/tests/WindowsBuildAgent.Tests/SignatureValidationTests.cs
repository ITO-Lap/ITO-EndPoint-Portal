using WindowsBuildAgent.Services;
using Xunit;

namespace WindowsBuildAgent.Tests;

/// <summary>
/// Tests AuthenticodeService's pure HRESULT-to-SignatureStatus classification
/// logic against fake/mocked trust result codes. Deliberately never calls
/// the real WinVerifyTrust Win32 API — <see cref="AuthenticodeService.ClassifyTrustResult"/>
/// is a static, dependency-free method exactly so this classification can be
/// unit tested without touching a real file or the Windows trust store.
/// </summary>
public sealed class SignatureValidationTests
{
    [Fact]
    public void ClassifyTrustResult_Success_MapsToValid()
    {
        Assert.Equal(SignatureStatus.Valid, AuthenticodeService.ClassifyTrustResult(AuthenticodeService.Success));
    }

    [Fact]
    public void ClassifyTrustResult_NoSignature_MapsToNotSigned()
    {
        Assert.Equal(SignatureStatus.NotSigned, AuthenticodeService.ClassifyTrustResult(AuthenticodeService.TrustE_NoSignature));
    }

    [Theory]
    [MemberData(nameof(UntrustedCodes))]
    public void ClassifyTrustResult_UntrustedCodes_MapToUntrusted(int hresult)
    {
        Assert.Equal(SignatureStatus.Untrusted, AuthenticodeService.ClassifyTrustResult(hresult));
    }

    public static IEnumerable<object[]> UntrustedCodes()
    {
        yield return new object[] { AuthenticodeService.TrustE_ExplicitDistrust };
        yield return new object[] { AuthenticodeService.TrustE_Subject_NotTrusted };
        yield return new object[] { AuthenticodeService.Cert_E_Untrustedroot };
    }

    [Fact]
    public void ClassifyTrustResult_ExpiredCert_MapsToExpired()
    {
        Assert.Equal(SignatureStatus.Expired, AuthenticodeService.ClassifyTrustResult(AuthenticodeService.Cert_E_Expired));
    }

    [Fact]
    public void ClassifyTrustResult_BadDigest_MapsToHashMismatch()
    {
        Assert.Equal(SignatureStatus.HashMismatch, AuthenticodeService.ClassifyTrustResult(AuthenticodeService.Trust_E_Bad_Digest));
    }

    [Fact]
    public void ClassifyTrustResult_UnrecognizedCode_MapsToUnknown_NeverToValid()
    {
        const int madeUpUnrecognizedCode = unchecked((int)0xDEADBEEF);
        var status = AuthenticodeService.ClassifyTrustResult(madeUpUnrecognizedCode);

        Assert.Equal(SignatureStatus.Unknown, status);
        Assert.NotEqual(SignatureStatus.Valid, status);
    }

    [Fact]
    public async Task InspectAsync_MissingFile_ThrowsFileNotFound()
    {
        var service = new AuthenticodeService(Microsoft.Extensions.Logging.Abstractions.NullLogger<AuthenticodeService>.Instance);
        var missingPath = Path.Combine(Path.GetTempPath(), "does-not-exist-" + Guid.NewGuid().ToString("N") + ".exe");

        await Assert.ThrowsAsync<FileNotFoundException>(() => service.InspectAsync(missingPath, CancellationToken.None));
    }
}
