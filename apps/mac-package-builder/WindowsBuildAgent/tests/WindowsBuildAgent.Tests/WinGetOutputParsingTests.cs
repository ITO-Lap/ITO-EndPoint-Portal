using WindowsBuildAgent.Services;
using Xunit;

namespace WindowsBuildAgent.Tests;

/// <summary>Parses fixture stdout captured from real `winget search`/`winget show` runs, without ever invoking winget itself.</summary>
public sealed class WinGetOutputParsingTests
{
    /// <summary>
    /// Built with explicit PadRight column widths (rather than hand-typed
    /// spacing) so the fixture's column alignment is unambiguous and matches
    /// exactly what the offset-based parser in WinGetService expects: each
    /// data row's columns start at the same character offset as the header's
    /// column names.
    /// </summary>
    private static string BuildSearchOutput(params (string Name, string Id, string Version, string Source)[] rows)
    {
        const int nameWidth = 21;
        const int idWidth = 28;
        const int versionWidth = 13;

        var header = "Name".PadRight(nameWidth) + "Id".PadRight(idWidth) + "Version".PadRight(versionWidth) + "Source";
        var separator = new string('-', header.Length);

        var lines = new List<string> { header, separator };
        foreach (var row in rows)
        {
            lines.Add(row.Name.PadRight(nameWidth) + row.Id.PadRight(idWidth) + row.Version.PadRight(versionWidth) + row.Source);
        }

        return string.Join('\n', lines) + "\n";
    }

    private static readonly string SampleSearchOutput = BuildSearchOutput(
        ("Visual Studio Code", "Microsoft.VisualStudioCode", "1.94.2", "winget"),
        ("7-Zip", "7zip.7zip", "23.01", "winget"));

    private const string SampleShowOutput =
        "Found Visual Studio Code [Microsoft.VisualStudioCode]\n" +
        "Version: 1.94.2\n" +
        "Publisher: Microsoft Corporation\n" +
        "Publisher Url: https://microsoft.com\n" +
        "Homepage: https://code.visualstudio.com\n" +
        "Description: Code editing. Redefined.\n" +
        "License: MIT\n" +
        "Installer Type: exe\n" +
        "Architecture: x64\n" +
        "Scope: user\n" +
        "Installer Url: https://update.code.visualstudio.com/1.94.2/win32-x64/stable\n" +
        "Installer SHA256: ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789\n" +
        "Offline Distribution Supported: true\n" +
        "Dependencies:\n" +
        "  None\n";

    [Fact]
    public void ParseSearchOutput_ReturnsExpectedPackages()
    {
        var results = WinGetService.ParseSearchOutput(SampleSearchOutput);

        Assert.NotEmpty(results);
        Assert.Contains(results, r => r.Id.Contains("7zip", StringComparison.OrdinalIgnoreCase) && r.Version == "23.01");
    }

    [Fact]
    public void ParseSearchOutput_EmptyInput_ReturnsEmptyList()
    {
        var results = WinGetService.ParseSearchOutput(string.Empty);
        Assert.Empty(results);
    }

    [Fact]
    public void ParseShowOutput_ExtractsCoreFields()
    {
        var detail = WinGetService.ParseShowOutput("Microsoft.VisualStudioCode", SampleShowOutput);

        Assert.Equal("Microsoft.VisualStudioCode", detail.Id);
        Assert.Equal("Microsoft Corporation", detail.Publisher);
        Assert.Equal("1.94.2", detail.Version);
        Assert.Equal("exe", detail.InstallerType);
        Assert.Equal("x64", detail.Architecture);
        Assert.Equal("user", detail.Scope);
        Assert.True(detail.SupportsOffline);
        Assert.Equal("ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789", detail.Sha256);
    }

    [Fact]
    public void ParseShowOutput_MissingFields_DoesNotThrow()
    {
        var detail = WinGetService.ParseShowOutput("Some.Package", "Version: 2.0.0\n");

        Assert.Equal("2.0.0", detail.Version);
        Assert.Equal(string.Empty, detail.Publisher);
        Assert.False(detail.SupportsOffline);
    }
}
