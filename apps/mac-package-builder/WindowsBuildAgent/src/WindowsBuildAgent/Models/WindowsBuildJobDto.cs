namespace WindowsBuildAgent.Models;

public enum JobKindDto
{
    Download,
    Package
}

/// <summary>Current status of a job, returned by GET /jobs/{id}.</summary>
public sealed record WindowsBuildJobDto(
    string JobId,
    JobKindDto Kind,
    JobPhaseDto Phase,
    double ProgressPercent,
    IReadOnlyList<string> LogLines,
    string? ErrorMessage,
    DateTimeOffset CreatedUtc,
    DateTimeOffset UpdatedUtc,
    DateTimeOffset? CompletedUtc
);

/// <summary>Request body for POST /jobs/download.</summary>
public sealed record DownloadJobRequest(
    string PackageId,
    string Version,
    string Architecture,
    string Scope,
    string? ExpectedSha256
);

/// <summary>Request body for POST /jobs/package.</summary>
public sealed record PackageJobRequest(
    string DownloadJobId,
    string SetupFileRelativePath,
    // Reserved for a future revision that packages multi-file installer
    // payloads (e.g. an EXE plus side-by-side config files) into a single
    // .intunewin; not yet consumed by IntuneWinPackagingService, which
    // currently packages the whole validated source folder as-is.
    IReadOnlyList<string>? AdditionalFileRelativePaths,
    bool AllowCatalogPackage
);

/// <summary>
/// One artifact produced by a completed job. Only metadata is returned by
/// GET /jobs/{id}/artifacts (one of the 8 documented endpoints); this project
/// deliberately does not add a separate byte-streaming download route in
/// this pass, to keep the endpoint surface exactly as specified.
/// </summary>
public sealed record JobArtifactDto(
    string RelativePath,
    long SizeBytes,
    string Sha256
);

public sealed record JobArtifactListResponse(
    string JobId,
    IReadOnlyList<JobArtifactDto> Artifacts
);
