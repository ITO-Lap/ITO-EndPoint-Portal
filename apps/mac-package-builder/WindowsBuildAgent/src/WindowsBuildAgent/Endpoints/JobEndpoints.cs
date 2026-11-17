using System.Security.Cryptography;
using WindowsBuildAgent.Models;
using WindowsBuildAgent.Services;

namespace WindowsBuildAgent.Endpoints;

/// <summary>
/// POST /jobs/download, POST /jobs/package, GET /jobs/{id}, POST
/// /jobs/{id}/cancel, GET /jobs/{id}/artifacts — exactly the 8 documented
/// endpoints across this file plus Health/WinGet. There is intentionally no
/// generic "run a command" or "exec" endpoint anywhere in this project.
/// </summary>
public static class JobEndpoints
{
    public static void MapJobEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/jobs/download", HandleDownloadJobAsync)
            .RequireAuthorization()
            .WithName("SubmitDownloadJob");

        app.MapPost("/jobs/package", HandlePackageJobAsync)
            .RequireAuthorization()
            .WithName("SubmitPackageJob");

        app.MapGet("/jobs/{id}", (string id, IJobStore jobStore) =>
            {
                if (!jobStore.TryGetJob(id, out var job))
                {
                    return Results.NotFound(new { error = $"No job found with id '{id}'." });
                }

                return Results.Ok(job.ToDto());
            })
            .RequireAuthorization()
            .WithName("GetJobStatus");

        app.MapPost("/jobs/{id}/cancel", (string id, IJobStore jobStore) =>
            {
                try
                {
                    jobStore.CancelJob(id);
                    return Results.Ok(jobStore.GetJob(id).ToDto());
                }
                catch (JobStoreException ex)
                {
                    return Results.NotFound(new { error = ex.Message });
                }
            })
            .RequireAuthorization()
            .WithName("CancelJob");

        app.MapGet("/jobs/{id}/artifacts", (string id, string? name, IJobStore jobStore) =>
            {
                if (!jobStore.TryGetJob(id, out var job))
                {
                    return Results.NotFound(new { error = $"No job found with id '{id}'." });
                }

                if (job.Phase != JobPhaseDto.Completed)
                {
                    return Results.Conflict(new { error = "Job has not completed successfully; no artifacts are available yet." });
                }

                // The macOS client asks for a small, fixed artifact alias.
                // Never accept a relative path from the caller: aliases are
                // resolved from files already inside this job's workspace.
                if (!string.IsNullOrWhiteSpace(name))
                {
                    var requested = ResolveArtifactAlias(job.WorkingDirectory, name);
                    return requested is null
                        ? Results.NotFound(new { error = "Requested artifact is not available for this job." })
                        : Results.File(requested, "application/octet-stream", Path.GetFileName(requested));
                }

                var artifacts = new List<JobArtifactDto>();
                if (Directory.Exists(job.WorkingDirectory))
                {
                    foreach (var file in Directory.EnumerateFiles(job.WorkingDirectory, "*", SearchOption.AllDirectories))
                    {
                        var info = new FileInfo(file);
                        var hash = ComputeSha256Hex(file);
                        var relativeName = Path.GetRelativePath(job.WorkingDirectory, file).Replace('\\', '/');
                        artifacts.Add(new JobArtifactDto(
                            RelativePath: relativeName,
                            SizeBytes: info.Length,
                            Sha256: hash));
                    }
                }

                return Results.Ok(new JobArtifactListResponse(id, artifacts));
            })
            .RequireAuthorization()
            .WithName("GetJobArtifacts");
    }

    private static async Task<IResult> HandleDownloadJobAsync(
        DownloadJobRequest request,
        IJobStore jobStore,
        IWinGetService winGet,
        IPathValidationService pathValidator,
        Microsoft.Extensions.Options.IOptions<JobStoreOptions> jobStoreOptions,
        ILoggerFactory loggerFactory)
    {
        try
        {
            WinGetServiceInputValidation.ValidateDownloadRequest(request);
        }
        catch (WinGetValidationException ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }

        JobRecord job;
        try
        {
            job = jobStore.CreateJob(JobKindDto.Download);
        }
        catch (JobStoreException ex)
        {
            return Results.Json(new { error = ex.Message }, statusCode: StatusCodes.Status429TooManyRequests);
        }

        var logger = loggerFactory.CreateLogger("DownloadJob");
        var jobRoot = jobStoreOptions.Value.RootDirectory;

        _ = Task.Run(async () =>
        {
            job.Phase = JobPhaseDto.Downloading;
            job.UpdatedUtc = DateTimeOffset.UtcNow;

            try
            {
                var destination = pathValidator.ValidateAndResolve(jobRoot, job.WorkingDirectory);
                job.LogLines.Add($"Downloading {request.PackageId} {request.Version} ({request.Architecture}/{request.Scope})...");

                var downloadedPath = await winGet.DownloadAsync(
                    request.PackageId, request.Version, request.Architecture, request.Scope, destination, job.CancellationTokenSource.Token)
                    .ConfigureAwait(false);

                job.Phase = JobPhaseDto.Validating;
                job.ProgressPercent = 60;
                job.LogLines.Add($"Downloaded: {Path.GetFileName(downloadedPath)}");

                if (!string.IsNullOrWhiteSpace(request.ExpectedSha256))
                {
                    var actual = ComputeSha256Hex(downloadedPath);
                    if (!string.Equals(actual, request.ExpectedSha256, StringComparison.OrdinalIgnoreCase))
                    {
                        job.Phase = JobPhaseDto.Failed;
                        job.ErrorMessage = $"SHA-256 mismatch. Expected {request.ExpectedSha256}, got {actual}.";
                        job.CompletedUtc = DateTimeOffset.UtcNow;
                        job.UpdatedUtc = DateTimeOffset.UtcNow;
                        return;
                    }

                    job.LogLines.Add("SHA-256 verified against manifest.");
                }

                job.Phase = JobPhaseDto.Completed;
                job.ProgressPercent = 100;
                job.CompletedUtc = DateTimeOffset.UtcNow;
            }
            catch (OperationCanceledException)
            {
                job.Phase = JobPhaseDto.Cancelled;
                job.CompletedUtc = DateTimeOffset.UtcNow;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Download job {JobId} failed", job.JobId);
                job.Phase = JobPhaseDto.Failed;
                job.ErrorMessage = ex.Message;
                job.CompletedUtc = DateTimeOffset.UtcNow;
            }
            finally
            {
                job.UpdatedUtc = DateTimeOffset.UtcNow;
            }
        }, job.CancellationTokenSource.Token);

        return Results.Accepted($"/jobs/{job.JobId}", job.ToDto());
    }

    private static async Task<IResult> HandlePackageJobAsync(
        PackageJobRequest request,
        IJobStore jobStore,
        IIntuneWinPackagingService packagingService,
        IPathValidationService pathValidator,
        Microsoft.Extensions.Options.IOptions<JobStoreOptions> jobStoreOptions,
        ILoggerFactory loggerFactory)
    {
        if (string.IsNullOrWhiteSpace(request.DownloadJobId))
        {
            return Results.BadRequest(new { error = "downloadJobId is required." });
        }

        if (!jobStore.TryGetJob(request.DownloadJobId, out var sourceJob) || sourceJob.Phase != JobPhaseDto.Completed)
        {
            return Results.BadRequest(new { error = "The referenced download job does not exist or has not completed successfully." });
        }

        if (!pathValidator.IsSafeFileName(Path.GetFileName(request.SetupFileRelativePath)))
        {
            return Results.BadRequest(new { error = "setupFileRelativePath failed validation." });
        }

        JobRecord job;
        try
        {
            job = jobStore.CreateJob(JobKindDto.Package);
        }
        catch (JobStoreException ex)
        {
            return Results.Json(new { error = ex.Message }, statusCode: StatusCodes.Status429TooManyRequests);
        }

        var logger = loggerFactory.CreateLogger("PackageJob");
        var jobRoot = jobStoreOptions.Value.RootDirectory;

        await Task.Run(async () =>
        {
            job.Phase = JobPhaseDto.Packaging;
            job.UpdatedUtc = DateTimeOffset.UtcNow;

            try
            {
                var sourceFolder = pathValidator.ValidateAndResolve(jobRoot, sourceJob.WorkingDirectory);
                var outputFolder = pathValidator.ValidateAndResolve(jobRoot, job.WorkingDirectory);

                job.LogLines.Add($"Packaging {request.SetupFileRelativePath} from download job {request.DownloadJobId}...");

                var producedPath = await packagingService.PackageAsync(
                    sourceFolder, request.SetupFileRelativePath, outputFolder, job.CancellationTokenSource.Token)
                    .ConfigureAwait(false);

                job.LogLines.Add($"Produced: {Path.GetFileName(producedPath)}");
                job.Phase = JobPhaseDto.Completed;
                job.ProgressPercent = 100;
                job.CompletedUtc = DateTimeOffset.UtcNow;
            }
            catch (OperationCanceledException)
            {
                job.Phase = JobPhaseDto.Cancelled;
                job.CompletedUtc = DateTimeOffset.UtcNow;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Package job {JobId} failed", job.JobId);
                job.Phase = JobPhaseDto.Failed;
                job.ErrorMessage = ex.Message;
                job.CompletedUtc = DateTimeOffset.UtcNow;
            }
            finally
            {
                job.UpdatedUtc = DateTimeOffset.UtcNow;
            }
        }, job.CancellationTokenSource.Token).ConfigureAwait(false);

        return Results.Accepted($"/jobs/{job.JobId}", job.ToDto());
    }

    private static string ComputeSha256Hex(string filePath)
    {
        using var stream = File.OpenRead(filePath);
        var hash = SHA256.HashData(stream);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static string? ResolveArtifactAlias(string jobDirectory, string alias)
    {
        if (!Directory.Exists(jobDirectory)) return null;
        return alias switch
        {
            "installer" => Directory.EnumerateFiles(jobDirectory, "*", SearchOption.AllDirectories)
                .FirstOrDefault(path => new[] { ".msi", ".exe", ".msix", ".msixbundle", ".zip" }
                    .Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase)),
            "package.intunewin" => Directory.EnumerateFiles(jobDirectory, "*.intunewin", SearchOption.AllDirectories)
                .FirstOrDefault(),
            "endpoint-central.zip" => Directory.EnumerateFiles(jobDirectory, "endpoint-central.zip", SearchOption.AllDirectories)
                .FirstOrDefault(),
            _ => null
        };
    }
}

/// <summary>Validates job request DTOs before a job is ever created, reusing WinGetService's allowlist regexes.</summary>
internal static class WinGetServiceInputValidation
{
    public static void ValidateDownloadRequest(DownloadJobRequest request)
    {
        WinGetService.ValidatePackageId(request.PackageId);
        WinGetService.ValidateVersion(request.Version);
        WinGetService.ValidateArchitecture(request.Architecture);
        WinGetService.ValidateScope(request.Scope);

        if (request.ExpectedSha256 is not null &&
            (request.ExpectedSha256.Length != 64 || !IsHex(request.ExpectedSha256)))
        {
            throw new WinGetValidationException("expectedSha256 must be a 64-character hex string.");
        }
    }

    private static bool IsHex(string value) => value.All(Uri.IsHexDigit);
}
