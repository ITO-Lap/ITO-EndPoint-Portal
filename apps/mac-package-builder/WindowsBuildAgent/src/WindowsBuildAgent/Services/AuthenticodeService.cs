using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace WindowsBuildAgent.Services;

/// <summary>
/// Real Authenticode inspection via WinVerifyTrust + X509Certificate2 +
/// FileVersionInfo. All Win32 interop lives behind a runtime OS guard so the
/// assembly can still be loaded (though not meaningfully exercised) for
/// unit-testing the pure classification logic on other platforms; the actual
/// call throws <see cref="PlatformNotSupportedException"/> off-Windows.
///
/// The mapping from a raw WinVerifyTrust HRESULT to a <see cref="SignatureStatus"/>
/// is isolated in the internal static <see cref="ClassifyTrustResult"/> so it
/// can be unit tested against fake/mocked HRESULT values without ever
/// invoking the real Win32 API (see SignatureValidationTests).
/// </summary>
public sealed class AuthenticodeService : IAuthenticodeService
{
    private readonly ILogger<AuthenticodeService> _logger;

    // Well-known WinVerifyTrust result codes (winerror.h / wintrust.h).
    internal const int TrustE_NoSignature = unchecked((int)0x800B0100);
    internal const int TrustE_ExplicitDistrust = unchecked((int)0x800B0111);
    internal const int TrustE_Subject_NotTrusted = unchecked((int)0x800B0004);
    internal const int Cert_E_Expired = unchecked((int)0x800B0101);
    internal const int Cert_E_Untrustedroot = unchecked((int)0x800B0109);
    internal const int Trust_E_Bad_Digest = unchecked((int)0x80096010);
    internal const int Success = 0;

    private static readonly Guid WintrustActionGenericVerifyV2 = new("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");

    public AuthenticodeService(ILogger<AuthenticodeService> logger)
    {
        _logger = logger;
    }

    public async Task<AuthenticodeResult> InspectAsync(string filePath, CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException(
                "Authenticode inspection requires WinVerifyTrust and is only supported on Windows.");
        }

        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException("File to inspect was not found.", filePath);
        }

        return await Task.Run(() => InspectOnWindows(filePath), cancellationToken).ConfigureAwait(false);
    }

    [SupportedOSPlatform("windows")]
    private AuthenticodeResult InspectOnWindows(string filePath)
    {
        var actualHash = ComputeSha256Hex(filePath);
        var trustResult = CallWinVerifyTrust(filePath);
        var status = ClassifyTrustResult(trustResult);

        string? publisher = null;
        string? subject = null;
        DateTimeOffset? signingTimestamp = null;
        DateTimeOffset? certExpiry = null;

        try
        {
            using var cert = new X509Certificate2(X509Certificate.CreateFromSignedFile(filePath));
            publisher = cert.GetNameInfo(X509NameType.SimpleName, forIssuer: false);
            subject = cert.Subject;
            certExpiry = cert.NotAfter.ToUniversalTime();
            // Authenticode counter-signature timestamp is not directly
            // exposed by X509Certificate2; a full implementation would parse
            // the PKCS#7 SignerInfo counter-signature attribute. Left as the
            // certificate's own validity start as a conservative stand-in,
            // flagged for follow-up.
            signingTimestamp = cert.NotBefore.ToUniversalTime();
        }
        catch (CryptographicException ex)
        {
            _logger.LogInformation(ex, "No Authenticode certificate could be read from {FilePath}", filePath);
            if (status != SignatureStatus.NotSigned)
            {
                status = SignatureStatus.NotSigned;
            }
        }

        var versionInfo = FileVersionInfo.GetVersionInfo(filePath);

        return new AuthenticodeResult(
            status,
            publisher,
            subject,
            signingTimestamp,
            certExpiry,
            versionInfo.FileVersion,
            versionInfo.ProductVersion,
            actualHash);
    }

    /// <summary>
    /// Pure classification of a WinVerifyTrust HRESULT into our
    /// <see cref="SignatureStatus"/> enum. Intentionally has no dependency on
    /// P/Invoke or file I/O so it can be unit tested directly.
    /// </summary>
    internal static SignatureStatus ClassifyTrustResult(int hresult)
    {
        return hresult switch
        {
            Success => SignatureStatus.Valid,
            TrustE_NoSignature => SignatureStatus.NotSigned,
            TrustE_ExplicitDistrust => SignatureStatus.Untrusted,
            TrustE_Subject_NotTrusted => SignatureStatus.Untrusted,
            Cert_E_Untrustedroot => SignatureStatus.Untrusted,
            Cert_E_Expired => SignatureStatus.Expired,
            Trust_E_Bad_Digest => SignatureStatus.HashMismatch,
            _ => SignatureStatus.Unknown
        };
    }

    private static string ComputeSha256Hex(string filePath)
    {
        using var stream = File.OpenRead(filePath);
        var hash = SHA256.HashData(stream);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    [SupportedOSPlatform("windows")]
    private int CallWinVerifyTrust(string filePath)
    {
        var fileInfo = new WINTRUST_FILE_INFO
        {
            cbStruct = (uint)Marshal.SizeOf<WINTRUST_FILE_INFO>(),
            pcwszFilePath = filePath,
            hFile = IntPtr.Zero,
            pgKnownSubject = IntPtr.Zero
        };

        var fileInfoPtr = Marshal.AllocHGlobal(Marshal.SizeOf<WINTRUST_FILE_INFO>());
        var trustDataPtr = IntPtr.Zero;
        var actionGuid = WintrustActionGenericVerifyV2;

        try
        {
            Marshal.StructureToPtr(fileInfo, fileInfoPtr, false);

            var trustData = new WINTRUST_DATA
            {
                cbStruct = (uint)Marshal.SizeOf<WINTRUST_DATA>(),
                pPolicyCallbackData = IntPtr.Zero,
                pSIPClientData = IntPtr.Zero,
                dwUIChoice = WTD_UI_NONE,
                fdwRevocationChecks = WTD_REVOKE_NONE,
                dwUnionChoice = WTD_CHOICE_FILE,
                pFile = fileInfoPtr,
                dwStateAction = WTD_STATEACTION_VERIFY,
                hWVTStateData = IntPtr.Zero,
                pwszURLReference = IntPtr.Zero,
                dwProvFlags = WTD_SAFER_FLAG,
                dwUIContext = 0
            };

            trustDataPtr = Marshal.AllocHGlobal(Marshal.SizeOf<WINTRUST_DATA>());
            Marshal.StructureToPtr(trustData, trustDataPtr, false);

            var result = WinVerifyTrust(IntPtr.Zero, ref actionGuid, trustDataPtr);

            // Always close the trust state to release resources, per WinTrust docs.
            trustData.dwStateAction = WTD_STATEACTION_CLOSE;
            Marshal.StructureToPtr(trustData, trustDataPtr, true);
            WinVerifyTrust(IntPtr.Zero, ref actionGuid, trustDataPtr);

            return result;
        }
        finally
        {
            Marshal.FreeHGlobal(fileInfoPtr);
            if (trustDataPtr != IntPtr.Zero) Marshal.FreeHGlobal(trustDataPtr);
        }
    }

    private const uint WTD_UI_NONE = 2;
    private const uint WTD_REVOKE_NONE = 0;
    private const uint WTD_CHOICE_FILE = 1;
    private const uint WTD_STATEACTION_VERIFY = 1;
    private const uint WTD_STATEACTION_CLOSE = 2;
    private const uint WTD_SAFER_FLAG = 0x100;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WINTRUST_FILE_INFO
    {
        public uint cbStruct;
        public string pcwszFilePath;
        public IntPtr hFile;
        public IntPtr pgKnownSubject;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WINTRUST_DATA
    {
        public uint cbStruct;
        public IntPtr pPolicyCallbackData;
        public IntPtr pSIPClientData;
        public uint dwUIChoice;
        public uint fdwRevocationChecks;
        public uint dwUnionChoice;
        public IntPtr pFile;
        public uint dwStateAction;
        public IntPtr hWVTStateData;
        public IntPtr pwszURLReference;
        public uint dwProvFlags;
        public uint dwUIContext;
    }

    [DllImport("wintrust.dll", ExactSpelling = true, SetLastError = false, CharSet = CharSet.Unicode)]
    private static extern int WinVerifyTrust(IntPtr hwnd, ref Guid pgActionID, IntPtr pWVTData);
}
