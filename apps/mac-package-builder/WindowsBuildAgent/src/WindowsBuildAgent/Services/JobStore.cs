using System.Collections.Concurrent;
using Microsoft.Extensions.Options;
using WindowsBuildAgent.Models;

namespace WindowsBuildAgent.Services;

public sealed class JobStoreOptions
{
    public string RootDirectory { get; set; } = string.Empty;
    public int MaxConcurrentJobs { get; set; } = 3;
    public int JobTimeoutMinutes { get; set; } = 30;
    public int ArtifactRetentionHours { get; set; } = 24;
    public int SweepIntervalMinutes { get; set; } = 15;
}

/// <summary>
/// ConcurrentDictionary-backed job registry. Enforces
/// <see cref="JobStoreOptions.MaxConcurrentJobs"/> at creation time (counting
/// only jobs that are not yet in a terminal phase), gives every job its own
/// directory under <see cref="JobStoreOptions.RootDirectory"/>, and exposes a
/// per-job <see cref="CancellationTokenSource"/> for real cancellation.
/// </summary>
public sealed class JobStore : IJobStore
{
    private static readonly HashSet<JobPhaseDto> TerminalPhases = new()
    {
        JobPhaseDto.Completed, JobPhaseDto.Failed, JobPhaseDto.Cancelled
    };

    private readonly ConcurrentDictionary<string, JobRecord> _jobs = new();
    private readonly JobStoreOptions _options;
    private readonly ILogger<JobStore> _logger;
    private readonly object _createLock = new();

    public JobStore(IOptions<JobStoreOptions> options, ILogger<JobStore> logger)
    {
        _options = options.Value;
        _logger = logger;

        if (!string.IsNullOrWhiteSpace(_options.RootDirectory))
        {
            Directory.CreateDirectory(_options.RootDirectory);
        }
    }

    public int MaxConcurrentJobs => _options.MaxConcurrentJobs;

    public int ActiveJobCount => _jobs.Values.Count(j => !TerminalPhases.Contains(j.Phase));

    public JobRecord CreateJob(JobKindDto kind)
    {
        lock (_createLock)
        {
            if (ActiveJobCount >= _options.MaxConcurrentJobs)
            {
                throw new JobStoreException($"Maximum concurrent job limit ({_options.MaxConcurrentJobs}) reached. Try again later.");
            }

            var jobId = Guid.NewGuid().ToString("N");
            var workingDirectory = Path.Combine(_options.RootDirectory, jobId);
            Directory.CreateDirectory(workingDirectory);

            var record = new JobRecord
            {
                JobId = jobId,
                Kind = kind,
                WorkingDirectory = workingDirectory
            };

            if (!_jobs.TryAdd(jobId, record))
            {
                throw new JobStoreException("Failed to register new job (id collision).");
            }

            return record;
        }
    }

    public JobRecord GetJob(string jobId)
    {
        if (!_jobs.TryGetValue(jobId, out var job))
        {
            throw new JobStoreException($"No job found with id '{jobId}'.");
        }

        return job;
    }

    public bool TryGetJob(string jobId, out JobRecord job)
    {
        return _jobs.TryGetValue(jobId, out job!);
    }

    public void CancelJob(string jobId)
    {
        var job = GetJob(jobId);

        if (TerminalPhases.Contains(job.Phase))
        {
            return; // already finished; cancelling is a no-op, not an error
        }

        job.CancellationTokenSource.Cancel();
        job.Phase = JobPhaseDto.Cancelled;
        job.UpdatedUtc = DateTimeOffset.UtcNow;
        job.CompletedUtc = DateTimeOffset.UtcNow;
    }

    /// <summary>Removes job directories/records whose retention window has expired. Called by the background sweep hosted service.</summary>
    internal void SweepExpiredJobs(TimeSpan retention)
    {
        var cutoff = DateTimeOffset.UtcNow - retention;

        foreach (var (jobId, job) in _jobs)
        {
            if (!TerminalPhases.Contains(job.Phase)) continue;
            var finishedAt = job.CompletedUtc ?? job.UpdatedUtc;
            if (finishedAt > cutoff) continue;

            try
            {
                if (Directory.Exists(job.WorkingDirectory))
                {
                    Directory.Delete(job.WorkingDirectory, recursive: true);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete expired job directory for {JobId}", jobId);
                continue; // leave the record so we retry next sweep
            }

            _jobs.TryRemove(jobId, out _);
            job.CancellationTokenSource.Dispose();
            _logger.LogInformation("Swept expired job {JobId} (finished at {FinishedAt})", jobId, finishedAt);
        }
    }
}

/// <summary>Background service that periodically sweeps expired job artifacts/directories.</summary>
public sealed class JobRetentionSweepService : BackgroundService
{
    private readonly JobStore _jobStore;
    private readonly JobStoreOptions _options;
    private readonly ILogger<JobRetentionSweepService> _logger;

    public JobRetentionSweepService(IJobStore jobStore, IOptions<JobStoreOptions> options, ILogger<JobRetentionSweepService> logger)
    {
        // JobStore is registered as a singleton and exposed as IJobStore;
        // the sweep needs the internal method, so we require the concrete
        // type here via DI (registered explicitly in Program.cs).
        _jobStore = (JobStore)jobStore;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(Math.Max(1, _options.SweepIntervalMinutes));
        var retention = TimeSpan.FromHours(Math.Max(1, _options.ArtifactRetentionHours));

        using var timer = new PeriodicTimer(interval);
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
        {
            try
            {
                _jobStore.SweepExpiredJobs(retention);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Job retention sweep failed.");
            }
        }
    }
}
