namespace WindowsBuildAgent.Services;

/// <summary>Result of a completed process invocation.</summary>
public sealed record ProcessRunResult(int ExitCode, string StdOut, string StdErr, bool TimedOut);

public sealed class ProcessRunnerException : Exception
{
    public ProcessRunnerException(string message) : base(message) { }
    public ProcessRunnerException(string message, Exception inner) : base(message, inner) { }
}

/// <summary>
/// Abstraction over <see cref="System.Diagnostics.Process"/> so every service
/// that shells out (winget.exe, IntuneWinAppUtil.exe) is testable with a fake
/// and so no call site can ever build a command as a single interpolated
/// string. This is the C# analogue of the Swift <c>ProcessRunning</c> protocol
/// (Sources/AppPackageBuilder/Services/ProcessRunner.swift) in the sibling
/// macOS app: same philosophy, ported to Windows.
///
/// Hard rules enforced by every implementation of this interface:
///  - Arguments are always passed as a list/array (<see cref="System.Diagnostics.ProcessStartInfo.ArgumentList"/>),
///    never as a single concatenated/interpolated command string.
///  - Never invokes "cmd /c", "powershell -Command &lt;string&gt;", or any
///    other shell-string-evaluation entry point. If PowerShell is ever
///    needed, it must be invoked with -File pointing at a fixed, reviewed
///    script and -NonInteractive, arguments still passed via ArgumentList.
///  - Every invocation accepts a <see cref="CancellationToken"/> and, on
///    cancellation or timeout, kills the entire process tree
///    (<see cref="System.Diagnostics.Process.Kill(bool)"/> with entireProcessTree: true).
/// </summary>
public interface IProcessRunner
{
    Task<ProcessRunResult> RunAsync(
        string executablePath,
        IReadOnlyList<string> arguments,
        string? workingDirectory,
        TimeSpan timeout,
        CancellationToken cancellationToken);
}
