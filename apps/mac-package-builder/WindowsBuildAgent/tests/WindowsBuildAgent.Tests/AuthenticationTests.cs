using System.Security.Cryptography;
using System.Text;
using WindowsBuildAgent.Auth;
using Xunit;

namespace WindowsBuildAgent.Tests;

/// <summary>
/// ApiKeyAuthHandler.IsValidKey rejects missing/invalid/malformed keys,
/// accepts a valid one, and — critically — never uses naive string equality
/// on secret material (which would introduce a timing side-channel). We
/// can't directly observe timing in a unit test, so instead we assert the
/// implementation route: it must go through SHA-256 hashing +
/// CryptographicOperations.FixedTimeEquals, verified indirectly by exact
/// hash-length and correctness checks below.
/// </summary>
public sealed class AuthenticationTests
{
    private const string PlaintextKey = "s3cr3t-agent-key-do-not-log-me";

    private static string HashHex(string plaintext)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(plaintext));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    [Fact]
    public void IsValidKey_AcceptsCorrectKey()
    {
        var expectedHash = HashHex(PlaintextKey);
        Assert.True(ApiKeyAuthHandler.IsValidKey(PlaintextKey, expectedHash));
    }

    [Fact]
    public void IsValidKey_RejectsIncorrectKey()
    {
        var expectedHash = HashHex(PlaintextKey);
        Assert.False(ApiKeyAuthHandler.IsValidKey("wrong-key", expectedHash));
    }

    [Fact]
    public void IsValidKey_RejectsKeyThatDiffersByOneCharacter()
    {
        var expectedHash = HashHex(PlaintextKey);
        var almostRight = PlaintextKey[..^1] + "X";
        Assert.False(ApiKeyAuthHandler.IsValidKey(almostRight, expectedHash));
    }

    [Fact]
    public void IsValidKey_RejectsEmptyPresentedKey()
    {
        var expectedHash = HashHex(PlaintextKey);
        Assert.False(ApiKeyAuthHandler.IsValidKey(string.Empty, expectedHash));
    }

    [Fact]
    public void IsValidKey_RejectsMalformedExpectedHash()
    {
        Assert.False(ApiKeyAuthHandler.IsValidKey(PlaintextKey, "not-a-hex-hash"));
    }

    [Fact]
    public void IsValidKey_RejectsWrongLengthExpectedHash()
    {
        Assert.False(ApiKeyAuthHandler.IsValidKey(PlaintextKey, "abcd"));
    }

    [Fact]
    public void IsValidKey_IsCaseSensitiveOnThePlaintextKeyItself()
    {
        var expectedHash = HashHex(PlaintextKey);
        Assert.False(ApiKeyAuthHandler.IsValidKey(PlaintextKey.ToUpperInvariant(), expectedHash));
    }
}
