using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using WindowsBuildAgent.Models;
using WindowsBuildAgent.Services;
using Xunit;

namespace WindowsBuildAgent.Tests;

/// <summary>Verifies the retention sweep deletes expired job directories/records and leaves fresh ones alone.</summary>
public sealed class CleanupTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "wba-sweep-" + Guid.NewGuid().ToString("N"));

    private JobStore CreateStore() =>
        new(Options.Create(new JobStoreOptions
        {
            RootDirectory = _root,
            MaxConcurrentJobs = 10,
            JobTimeoutMinutes = 30,
            ArtifactRetentionHours = 1,
            SweepIntervalMinutes = 15
        }), NullLogger<JobStore>.Instance);

    [Fact]
    public void SweepExpiredJobs_RemovesTerminalJobsPastRetentionWindow()
    {
        var store = CreateStore();
        var job = store.CreateJob(JobKindDto.Download);
        job.Phase = JobPhaseDto.Completed;
        job.CompletedUtc = DateTimeOffset.UtcNow - TimeSpan.FromHours(2);
        job.UpdatedUtc = job.CompletedUtc.Value;

        var workingDirectory = job.WorkingDirectory;
        Assert.True(Directory.Exists(workingDirectory));

        store.SweepExpiredJobs(TimeSpan.FromHours(1));

        Assert.False(Directory.Exists(workingDirectory));
        Assert.False(store.TryGetJob(job.JobId, out _));
    }

    [Fact]
    public void SweepExpiredJobs_LeavesRecentTerminalJobsAlone()
    {
        var store = CreateStore();
        var job = store.CreateJob(JobKindDto.Download);
        job.Phase = JobPhaseDto.Completed;
        job.CompletedUtc = DateTimeOffset.UtcNow;
        job.UpdatedUtc = job.CompletedUtc.Value;

        store.SweepExpiredJobs(TimeSpan.FromHours(1));

        Assert.True(Directory.Exists(job.WorkingDirectory));
        Assert.True(store.TryGetJob(job.JobId, out _));
    }

    [Fact]
    public void SweepExpiredJobs_NeverRemovesNonTerminalJobsRegardlessOfAge()
    {
        var store = CreateStore();
        var job = store.CreateJob(JobKindDto.Download);
        job.Phase = JobPhaseDto.Downloading;
        job.UpdatedUtc = DateTimeOffset.UtcNow - TimeSpan.FromDays(5);

        store.SweepExpiredJobs(TimeSpan.FromHours(1));

        Assert.True(Directory.Exists(job.WorkingDirectory));
        Assert.True(store.TryGetJob(job.JobId, out _));
    }

    [Fact]
    public void SweepExpiredJobs_RemovesFailedAndCancelledJobsPastRetention()
    {
        var store = CreateStore();

        var failed = store.CreateJob(JobKindDto.Download);
        failed.Phase = JobPhaseDto.Failed;
        failed.CompletedUtc = DateTimeOffset.UtcNow - TimeSpan.FromHours(3);
        failed.UpdatedUtc = failed.CompletedUtc.Value;

        var cancelled = store.CreateJob(JobKindDto.Package);
        cancelled.Phase = JobPhaseDto.Cancelled;
        cancelled.CompletedUtc = DateTimeOffset.UtcNow - TimeSpan.FromHours(3);
        cancelled.UpdatedUtc = cancelled.CompletedUtc.Value;

        store.SweepExpiredJobs(TimeSpan.FromHours(1));

        Assert.False(store.TryGetJob(failed.JobId, out _));
        Assert.False(store.TryGetJob(cancelled.JobId, out _));
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            try { Directory.Delete(_root, recursive: true); } catch { /* best effort cleanup */ }
        }
    }
}
