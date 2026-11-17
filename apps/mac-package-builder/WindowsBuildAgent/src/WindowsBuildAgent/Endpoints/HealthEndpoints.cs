using Microsoft.Extensions.Options;
using WindowsBuildAgent.Models;
using WindowsBuildAgent.Services;

namespace WindowsBuildAgent.Endpoints;

public sealed class AgentInfoOptions
{
    public string AgentName { get; set; } = "WINDOWS-BUILD-AGENT";
}

/// <summary>GET /health — the only endpoint that reports the agent's own state, never a generic diagnostics/exec surface.</summary>
public static class HealthEndpoints
{
    public static void MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/health", async (
                IProcessRunner processRunner,
                IOptions<WinGetOptions> winGetOptions,
                IOptions<IntuneWinAppUtilOptions> intuneOptions,
                IOptions<AgentInfoOptions> agentInfoOptions,
                IJobStore jobStore,
                CancellationToken cancellationToken) =>
            {
                var dto = await BuildHealthDtoAsync(
                    processRunner, winGetOptions.Value, intuneOptions.Value, agentInfoOptions.Value, jobStore, cancellationToken)
                    .ConfigureAwait(false);

                return Results.Ok(dto);
            })
            .RequireAuthorization()
            .WithName("GetHealth");
    }

    internal static async Task<WindowsAgentInfoDto> BuildHealthDtoAsync(
        IProcessRunner processRunner,
        WinGetOptions winGetOptions,
        IntuneWinAppUtilOptions intuneOptions,
        AgentInfoOptions agentInfoOptions,
        IJobStore jobStore,
        CancellationToken cancellationToken)
    {
        string? winGetVersion = null;
        var winGetAvailable = false;

        try
        {
            if (File.Exists(winGetOptions.ExecutablePath))
            {
                var result = await processRunner.RunAsync(
                    winGetOptions.ExecutablePath,
                    new[] { "--version" },
                    workingDirectory: null,
                    TimeSpan.FromSeconds(10),
                    cancellationToken).ConfigureAwait(false);

                winGetAvailable = result.ExitCode == 0;
                winGetVersion = result.StdOut.Trim();
            }
        }
        catch
        {
            winGetAvailable = false;
        }

        var intuneAvailable = File.Exists(intuneOptions.ExecutablePath);
        string? intuneVersion = null;
        try
        {
            if (intuneAvailable)
            {
                var versionInfo = System.Diagnostics.FileVersionInfo.GetVersionInfo(intuneOptions.ExecutablePath);
                intuneVersion = versionInfo.FileVersion;
            }
        }
        catch
        {
            intuneVersion = null;
        }

        var (freeBytes, totalBytes) = GetDiskSpace(intuneOptions.ExecutablePath);

        return new WindowsAgentInfoDto(
            AgentName: agentInfoOptions.AgentName,
            OsVersion: Environment.OSVersion.VersionString,
            WinGetVersion: winGetVersion,
            WinGetAvailable: winGetAvailable,
            IntuneWinAppUtilAvailable: intuneAvailable,
            IntuneWinAppUtilVersion: intuneVersion,
            LastHeartbeatUtc: DateTimeOffset.UtcNow,
            FreeDiskBytes: freeBytes,
            TotalDiskBytes: totalBytes,
            Ready: winGetAvailable && intuneAvailable && jobStore.ActiveJobCount < jobStore.MaxConcurrentJobs,
            ActiveJobCount: jobStore.ActiveJobCount,
            MaxConcurrentJobs: jobStore.MaxConcurrentJobs);
    }

    private static (long FreeBytes, long TotalBytes) GetDiskSpace(string referencePath)
    {
        try
        {
            var root = Path.GetPathRoot(string.IsNullOrWhiteSpace(referencePath) ? AppContext.BaseDirectory : referencePath);
            if (string.IsNullOrWhiteSpace(root))
            {
                root = AppContext.BaseDirectory;
            }

            var drive = new DriveInfo(root);
            return (drive.AvailableFreeSpace, drive.TotalSize);
        }
        catch
        {
            return (0, 0);
        }
    }
}
