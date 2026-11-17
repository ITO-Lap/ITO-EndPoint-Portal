namespace WindowsBuildAgent.Models;

/// <summary>Single row of a `winget search` result.</summary>
public sealed record WinGetPackageDto(
    string Id,
    string Name,
    string Publisher,
    string Version,
    string Source
);

/// <summary>Full manifest detail from `winget show`, one specific version.</summary>
public sealed record WinGetPackageDetailDto(
    string Id,
    string Name,
    string Publisher,
    string Version,
    string? Description,
    string? Homepage,
    string? License,
    string InstallerType,
    string Architecture,
    string Scope,
    string? InstallerUrl,
    string? Sha256,
    bool SupportsOffline,
    IReadOnlyList<string> Dependencies,
    IReadOnlyList<string> AvailableVersions
);
