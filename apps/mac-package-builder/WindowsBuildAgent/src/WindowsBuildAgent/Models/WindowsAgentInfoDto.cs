namespace WindowsBuildAgent.Models;

/// <summary>Payload for GET /health. Never includes secrets or raw environment data.</summary>
public sealed record WindowsAgentInfoDto(
    string AgentName,
    string OsVersion,
    string? WinGetVersion,
    bool WinGetAvailable,
    bool IntuneWinAppUtilAvailable,
    string? IntuneWinAppUtilVersion,
    DateTimeOffset LastHeartbeatUtc,
    long FreeDiskBytes,
    long TotalDiskBytes,
    bool Ready,
    int ActiveJobCount,
    int MaxConcurrentJobs
);
