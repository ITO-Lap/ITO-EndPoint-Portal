namespace WindowsBuildAgent.Models;

/// <summary>Request body for POST /validate (sent by the ITO Windows Package Builder server).</summary>
public sealed record PackagerValidateRequest(
    string JobId,
    string SetupFile,
    string InstallCommand,
    string UninstallCommand,
    string DetectionScript,
    PackagerSourceInfo Source,
    string SourceUrl);

public sealed record PackagerSourceInfo(string Sha256, long SizeBytes);

/// <summary>Request body for POST /package.</summary>
public sealed record PackagerPackageRequest(
    string JobId,
    string SetupFile,
    string OutputName,
    string SourceUrl,
    string UploadUrl);

public sealed record PackagerStepDto(
    string Name,
    string Status,
    int? ExitCode,
    long? DurationMs,
    bool RebootIndicated,
    string? Stdout,
    string? Stderr);

public sealed record PackagerValidateResponse(IReadOnlyList<PackagerStepDto> Steps, string WorkerName);

public sealed record PackagerPackageResponse(string FileName, long SizeBytes, string Sha256, string WorkerName);
