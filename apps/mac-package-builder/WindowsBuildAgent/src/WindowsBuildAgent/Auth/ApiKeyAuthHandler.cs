using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace WindowsBuildAgent.Auth;

public static class ApiKeyAuthConstants
{
    public const string ApiKeySchemeName = "ApiKey";
}

public sealed class ApiKeyAuthSchemeOptions : AuthenticationSchemeOptions
{
    /// <summary>SHA-256 hex digest of the accepted API key. The plaintext key is never stored or compared.</summary>
    public string ApiKeyHashHex { get; set; } = string.Empty;

    public string HeaderName { get; set; } = "Authorization";

    public string Scheme { get; set; } = "Bearer";
}

/// <summary>
/// Validates the caller's bearer/API-key header against a securely stored
/// SHA-256 hash. The plaintext key configured on the agent is never compared
/// directly — the presented key is hashed and the two hashes are compared
/// using a constant-time comparison
/// (<see cref="CryptographicOperations.FixedTimeEquals"/>) so no timing
/// side-channel leaks how many leading bytes matched.
/// </summary>
public sealed class ApiKeyAuthHandler : AuthenticationHandler<ApiKeyAuthSchemeOptions>
{
    public ApiKeyAuthHandler(
        IOptionsMonitor<ApiKeyAuthSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(Options.HeaderName, out var headerValues))
        {
            return Task.FromResult(AuthenticateResult.Fail("Missing authentication header."));
        }

        var headerValue = headerValues.ToString();
        if (string.IsNullOrWhiteSpace(headerValue))
        {
            return Task.FromResult(AuthenticateResult.Fail("Empty authentication header."));
        }

        string presentedKey;
        var schemePrefix = Options.Scheme + " ";
        if (headerValue.StartsWith(schemePrefix, StringComparison.OrdinalIgnoreCase))
        {
            presentedKey = headerValue[schemePrefix.Length..].Trim();
        }
        else
        {
            // Malformed: header present but not in the expected "<Scheme> <key>" shape.
            return Task.FromResult(AuthenticateResult.Fail("Malformed authentication header."));
        }

        if (string.IsNullOrWhiteSpace(presentedKey))
        {
            return Task.FromResult(AuthenticateResult.Fail("Empty API key."));
        }

        if (string.IsNullOrWhiteSpace(Options.ApiKeyHashHex))
        {
            // Misconfiguration: never fail open. If no hash is configured,
            // nothing can ever authenticate.
            Logger.LogError("ApiKeyAuthHandler is missing a configured ApiKeyHashHex; rejecting all requests.");
            return Task.FromResult(AuthenticateResult.Fail("Authentication is not configured."));
        }

        if (!IsValidKey(presentedKey, Options.ApiKeyHashHex))
        {
            return Task.FromResult(AuthenticateResult.Fail("Invalid API key."));
        }

        var claims = new[] { new Claim(ClaimTypes.NameIdentifier, "windows-build-agent-client") };
        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, Scheme.Name);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }

    /// <summary>
    /// Hashes <paramref name="presentedKey"/> with SHA-256 and compares it to
    /// the configured hash using a constant-time comparison. Never uses
    /// string equality (==) or <see cref="string.Equals(string?)"/> on
    /// secret material, since those short-circuit on the first mismatched
    /// byte and can leak timing information about how much of the key was
    /// guessed correctly.
    /// </summary>
    internal static bool IsValidKey(string presentedKey, string expectedHashHex)
    {
        Span<byte> presentedHash = stackalloc byte[32];
        if (!SHA256.TryHashData(Encoding.UTF8.GetBytes(presentedKey), presentedHash, out _))
        {
            return false;
        }

        byte[] expectedHash;
        try
        {
            expectedHash = Convert.FromHexString(expectedHashHex);
        }
        catch (FormatException)
        {
            return false;
        }

        if (expectedHash.Length != presentedHash.Length)
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(presentedHash, expectedHash);
    }
}
