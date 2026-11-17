using WindowsBuildAgent.Services;
using Xunit;

namespace WindowsBuildAgent.Tests;

/// <summary>
/// PathValidationService is the Windows-side defense-in-depth counterpart to
/// the Mac app's PathValidator. It must reject traversal, UNC paths,
/// absolute paths outside the root, and reserved Windows device names.
/// </summary>
public sealed class PathTraversalTests
{
    private readonly PathValidationService _sut = new();
    private readonly string _root = Path.Combine(Path.GetTempPath(), "wba-root-" + Guid.NewGuid().ToString("N"));

    [Theory]
    [InlineData("..\\..\\Windows\\System32\\config")]
    [InlineData("../../etc/passwd")]
    [InlineData("subdir\\..\\..\\outside.txt")]
    [InlineData("..")]
    public void ValidateAndResolve_RejectsTraversal(string candidate)
    {
        Assert.Throws<PathValidationException>(() => _sut.ValidateAndResolve(_root, candidate));
    }

    [Theory]
    [InlineData(@"\\server\share\file.txt")]
    [InlineData("//server/share/file.txt")]
    public void ValidateAndResolve_RejectsUncPaths(string candidate)
    {
        Assert.Throws<PathValidationException>(() => _sut.ValidateAndResolve(_root, candidate));
    }

    [Fact]
    public void ValidateAndResolve_RejectsAbsolutePathOutsideRoot()
    {
        var outsideAbsolute = Path.Combine(Path.GetTempPath(), "some-other-dir", "file.txt");
        Assert.Throws<PathValidationException>(() => _sut.ValidateAndResolve(_root, outsideAbsolute));
    }

    [Theory]
    [InlineData("CON")]
    [InlineData("PRN.txt")]
    [InlineData("AUX")]
    [InlineData("NUL.log")]
    [InlineData("COM1")]
    [InlineData("com3.txt")]
    [InlineData("LPT9")]
    public void ValidateAndResolve_RejectsReservedDeviceNames(string reservedSegment)
    {
        Assert.Throws<PathValidationException>(() => _sut.ValidateAndResolve(_root, reservedSegment));
    }

    [Theory]
    [InlineData("CON")]
    [InlineData("PRN.exe")]
    [InlineData("nul")]
    public void IsSafeFileName_RejectsReservedDeviceNames(string reservedName)
    {
        Assert.False(_sut.IsSafeFileName(reservedName));
    }

    [Fact]
    public void ValidateAndResolve_AllowsPathsWithinRoot()
    {
        var candidate = Path.Combine("subdir", "installer.exe");
        var resolved = _sut.ValidateAndResolve(_root, candidate);

        var expectedPrefix = Path.GetFullPath(_root);
        Assert.StartsWith(expectedPrefix, resolved, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void IsSafeFileName_AcceptsOrdinaryFileNames()
    {
        Assert.True(_sut.IsSafeFileName("setup.exe"));
        Assert.True(_sut.IsSafeFileName("My-Installer_v2.1.msi"));
    }

    [Fact]
    public void IsSafeFileName_RejectsPathSeparatorsAndEmptyNames()
    {
        Assert.False(_sut.IsSafeFileName(""));
        Assert.False(_sut.IsSafeFileName("sub/dir/file.exe"));
        Assert.False(_sut.IsSafeFileName("sub\\dir\\file.exe"));
    }
}
