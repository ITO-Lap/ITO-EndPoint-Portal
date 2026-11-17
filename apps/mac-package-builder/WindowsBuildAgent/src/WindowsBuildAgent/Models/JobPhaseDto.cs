using System.Text.Json.Serialization;

namespace WindowsBuildAgent.Models;

/// <summary>
/// Mirrors the Swift <c>RemoteJobPhase</c> enum exactly so the Mac client can
/// decode job status without any translation layer. Keep the case list and
/// JSON string values in lockstep with
/// Sources/AppPackageBuilder/Windows/Models/RemoteJobPhase.swift.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<JobPhaseDto>))]
public enum JobPhaseDto
{
    Idle,
    Loading,
    Empty,
    Error,
    Disconnected,
    Downloading,
    Validating,
    Packaging,
    AwaitingApproval,
    Completed,
    Failed,
    Cancelled
}
