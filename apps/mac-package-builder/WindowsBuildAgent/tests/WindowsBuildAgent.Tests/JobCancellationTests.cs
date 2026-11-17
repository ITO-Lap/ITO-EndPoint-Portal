using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using WindowsBuildAgent.Models;
using WindowsBuildAgent.Services;
using Xunit;

namespace WindowsBuildAgent.Tests;

/// <summary>JobStore must cancel a running job's CancellationTokenSource and mark its phase Cancelled.</summary>
public sealed class JobCancellationTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "wba-jobstore-" + Guid.NewGuid().ToString("N"));

    private JobStore CreateStore(int maxConcurrentJobs = 3) =>
        new(Options.Create(new JobStoreOptions
        {
            RootDirectory = _root,
            MaxConcurrentJobs = maxConcurrentJobs,
            JobTimeoutMinutes = 30,
            ArtifactRetentionHours = 24,
            SweepIntervalMinutes = 15
        }), NullLogger<JobStore>.Instance);

    [Fact]
    public void CancelJob_CancelsTokenAndSetsPhaseCancelled()
    {
        var store = CreateStore();
        var job = store.CreateJob(JobKindDto.Download);

        job.Phase = JobPhaseDto.Downloading;
        Assert.False(job.CancellationTokenSource.IsCancellationRequested);

        store.CancelJob(job.JobId);

        Assert.True(job.CancellationTokenSource.IsCancellationRequested);
        Assert.Equal(JobPhaseDto.Cancelled, job.Phase);
        Assert.NotNull(job.CompletedUtc);
    }

    [Fact]
    public void CancelJob_AlreadyCompletedJob_IsANoOp_DoesNotThrow()
    {
        var store = CreateStore();
        var job = store.CreateJob(JobKindDto.Package);
        job.Phase = JobPhaseDto.Completed;
        job.CompletedUtc = DateTimeOffset.UtcNow;

        store.CancelJob(job.JobId);

        Assert.Equal(JobPhaseDto.Completed, job.Phase);
        Assert.False(job.CancellationTokenSource.IsCancellationRequested);
    }

    [Fact]
    public void CancelJob_UnknownJobId_ThrowsJobStoreException()
    {
        var store = CreateStore();
        Assert.Throws<JobStoreException>(() => store.CancelJob("does-not-exist"));
    }

    [Fact]
    public void CreateJob_EnforcesMaxConcurrentJobsLimit()
    {
        var store = CreateStore(maxConcurrentJobs: 2);
        store.CreateJob(JobKindDto.Download);
        store.CreateJob(JobKindDto.Download);

        Assert.Throws<JobStoreException>(() => store.CreateJob(JobKindDto.Download));
    }

    [Fact]
    public void CreateJob_AfterCompletion_FreesUpConcurrencySlot()
    {
        var store = CreateStore(maxConcurrentJobs: 1);
        var first = store.CreateJob(JobKindDto.Download);
        first.Phase = JobPhaseDto.Completed;
        first.CompletedUtc = DateTimeOffset.UtcNow;

        // Should not throw: the first job is terminal and no longer counts
        // against the concurrency limit.
        var second = store.CreateJob(JobKindDto.Download);
        Assert.NotEqual(first.JobId, second.JobId);
    }

    [Fact]
    public void CreateJob_GivesEachJobItsOwnIsolatedWorkingDirectory()
    {
        var store = CreateStore();
        var jobA = store.CreateJob(JobKindDto.Download);
        var jobB = store.CreateJob(JobKindDto.Download);

        Assert.NotEqual(jobA.WorkingDirectory, jobB.WorkingDirectory);
        Assert.True(Directory.Exists(jobA.WorkingDirectory));
        Assert.True(Directory.Exists(jobB.WorkingDirectory));
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            try { Directory.Delete(_root, recursive: true); } catch { /* best effort cleanup */ }
        }
    }
}
