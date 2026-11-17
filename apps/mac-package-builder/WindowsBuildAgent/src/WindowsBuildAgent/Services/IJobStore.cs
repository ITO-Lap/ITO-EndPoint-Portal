using WindowsBuildAgent.Models;

namespace WindowsBuildAgent.Services;

public sealed class JobStoreException : Exception
{
    public JobStoreException(string message) : base(message) { }
}

public sealed class JobRecord
{
    public required string JobId { get; init; }
    public required JobKindDto Kind { get; init; }
    public JobPhaseDto Phase { get; set; } = JobPhaseDto.Idle;
    public double ProgressPercent { get; set; }
    public List<string> LogLines { get; } = new();
    public string? ErrorMessage { get; set; }
    public required string WorkingDirectory { get; init; }
    public DateTimeOffset CreatedUtc { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedUtc { get; set; }
    public CancellationTokenSource CancellationTokenSource { get; } = new();

    public WindowsBuildJobDto ToDto() => new(
        JobId,
        Kind,
        Phase,
        ProgressPercent,
        LogLines.ToArray(),
        ErrorMessage,
        CreatedUtc,
        UpdatedUtc,
        CompletedUtc);
}

/// <summary>
/// In-memory job registry. Each job gets its own isolated working directory
/// under the configured root; a configurable maximum concurrent-job limit is
/// enforced at creation time; a background sweep removes expired job
/// directories/artifacts after the configured retention window.
/// </summary>
public interface IJobStore
{
    JobRecord CreateJob(JobKindDto kind);

    JobRecord GetJob(string jobId);

    bool TryGetJob(string jobId, out JobRecord job);

    void CancelJob(string jobId);

    int ActiveJobCount { get; }

    int MaxConcurrentJobs { get; }
}
