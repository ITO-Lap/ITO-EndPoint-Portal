using WindowsBuildAgent.Services;

namespace WindowsBuildAgent.Tests.Fakes;

/// <summary>
/// In-memory fake of <see cref="IProcessRunner"/> used by every test in this
/// suite that would otherwise shell out to winget.exe or
/// IntuneWinAppUtil.exe. No test in this project invokes a real external
/// process. Records every invocation so tests can assert on the exact
/// executable path and argument list passed, which is the core safety
/// property under test (ArgumentList-only, never a concatenated string).
/// </summary>
public sealed class FakeProcessRunner : IProcessRunner
{
    public sealed record Invocation(string ExecutablePath, IReadOnlyList<string> Arguments, string? WorkingDirectory);

    public List<Invocation> Invocations { get; } = new();

    /// <summary>Queue of results to return, one per call, in order. If empty, a default success result is returned.</summary>
    public Queue<ProcessRunResult> ResultsToReturn { get; } = new();

    public bool ThrowOperationCanceled { get; set; }

    public Task<ProcessRunResult> RunAsync(
        string executablePath,
        IReadOnlyList<string> arguments,
        string? workingDirectory,
        TimeSpan timeout,
        CancellationToken cancellationToken)
    {
        Invocations.Add(new Invocation(executablePath, arguments, workingDirectory));

        if (ThrowOperationCanceled)
        {
            throw new OperationCanceledException(cancellationToken);
        }

        cancellationToken.ThrowIfCancellationRequested();

        var result = ResultsToReturn.Count > 0
            ? ResultsToReturn.Dequeue()
            : new ProcessRunResult(0, string.Empty, string.Empty, TimedOut: false);

        return Task.FromResult(result);
    }
}
