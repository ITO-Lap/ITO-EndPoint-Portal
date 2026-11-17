using System.Security.Cryptography;
using Xunit;

namespace WindowsBuildAgent.Tests;

/// <summary>
/// The download job pipeline (see Endpoints/JobEndpoints.cs) compares an
/// actual SHA-256 of the downloaded file against the manifest-provided
/// expected hash using a case-insensitive hex comparison, and treats any
/// mismatch as blocking (job fails, no artifact is exposed). These tests
/// exercise that exact comparison logic in isolation.
/// </summary>
public sealed class HashComparisonTests
{
    private static string ComputeSha256Hex(byte[] content)
    {
        var hash = SHA256.HashData(content);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    /// <summary>Mirrors the comparison used in JobEndpoints.HandleDownloadJobAsync.</summary>
    private static bool HashesMatch(string actualHex, string expectedHex) =>
        string.Equals(actualHex, expectedHex, StringComparison.OrdinalIgnoreCase);

    [Fact]
    public void HashesMatch_IsCaseInsensitive()
    {
        var actual = ComputeSha256Hex("hello world"u8.ToArray());
        var expectedUpper = actual.ToUpperInvariant();
        var expectedMixed = ToMixedCase(actual);

        Assert.True(HashesMatch(actual, expectedUpper));
        Assert.True(HashesMatch(actual, expectedMixed));
    }

    [Fact]
    public void HashesMatch_DetectsMismatch()
    {
        var actual = ComputeSha256Hex("hello world"u8.ToArray());
        var wrongExpected = ComputeSha256Hex("goodbye world"u8.ToArray());

        Assert.False(HashesMatch(actual, wrongExpected));
    }

    [Fact]
    public void HashesMatch_SingleCharacterDifference_IsDetected()
    {
        var actual = ComputeSha256Hex("payload-A"u8.ToArray());
        var almostRight = ComputeSha256Hex("payload-B"u8.ToArray());

        Assert.NotEqual(actual, almostRight);
        Assert.False(HashesMatch(actual, almostRight));
    }

    [Fact]
    public void ComputeSha256Hex_IsDeterministic()
    {
        var content = "deterministic content"u8.ToArray();
        Assert.Equal(ComputeSha256Hex(content), ComputeSha256Hex(content));
    }

    private static string ToMixedCase(string hex)
    {
        var chars = hex.ToCharArray();
        for (var i = 0; i < chars.Length; i += 2)
        {
            chars[i] = char.ToUpperInvariant(chars[i]);
        }
        return new string(chars);
    }
}
