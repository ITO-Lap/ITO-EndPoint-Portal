using System.Diagnostics;
using System.Text;

namespace WindowsBuildAgent.Services;

/// <summary>
/// Real implementation of <see cref="IProcessRunner"/> wrapping
/// <see cref="Process"/>. NEVER builds a command string: callers always pass
/// an executable path plus an argument list, and those are copied verbatim
/// into <see cref="ProcessStartInfo.ArgumentList"/>. <see cref="ProcessStartInfo.UseShellExecute"/>
/// is always false, so there is no shell interpretation of the arguments at all.
/// </summary>
public sealed class ProcessRunner : IProcessRunner
{
    private readonly ILogger<ProcessRunner> _logger;

    public ProcessRunner(ILogger<ProcessRunner> logger)
    {
        _logger = logger;
    }

    public async Task<ProcessRunResult> RunAsync(
        string executablePath,
        IReadOnlyList<string> arguments,
        string? workingDirectory,
        TimeSpan timeout,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(executablePath))
        {
            throw new ProcessRunnerException("Executable path must not be empty.");
        }

        if (!File.Exists(executablePath))
        {
            throw new ProcessRunnerException($"Executable not found: {executablePath}");
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = executablePath,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            // Deliberately never set: startInfo.Arguments (string form). Only
            // ArgumentList is used, so no shell/quote parsing of caller input
            // ever happens.
        };

        foreach (var arg in arguments)
        {
            startInfo.ArgumentList.Add(arg);
        }

        if (!string.IsNullOrWhiteSpace(workingDirectory))
        {
            startInfo.WorkingDirectory = workingDirectory;
        }

        using var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
        var stdout = new StringBuilder();
        var stderr = new StringBuilder();

        process.OutputDataReceived += (_, e) =>
        {
            if (e.Data is not null) stdout.AppendLine(e.Data);
        };
        process.ErrorDataReceived += (_, e) =>
        {
            if (e.Data is not null) stderr.AppendLine(e.Data);
        };

        using var timeoutCts = new CancellationTokenSource(timeout);
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

        try
        {
            if (!process.Start())
            {
                throw new ProcessRunnerException($"Failed to start process: {executablePath}");
            }

            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            try
            {
                await process.WaitForExitAsync(linkedCts.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                KillEntireProcessTree(process);

                // Give the kill a moment to land, then surface the right reason.
                try { await process.WaitForExitAsync(CancellationToken.None).ConfigureAwait(false); } catch { /* best effort */ }

                if (timeoutCts.IsCancellationRequested && !cancellationToken.IsCancellationRequested)
                {
                    return new ProcessRunResult(-1, stdout.ToString(), stderr.ToString(), TimedOut: true);
                }

                throw new OperationCanceledException("Process execution was cancelled.", cancellationToken);
            }

            return new ProcessRunResult(process.ExitCode, stdout.ToString(), stderr.ToString(), TimedOut: false);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex) when (ex is not ProcessRunnerException)
        {
            _logger.LogError(ex, "Process execution failed for {Executable}", executablePath);
            throw new ProcessRunnerException($"Process execution failed for {executablePath}", ex);
        }
    }

    private void KillEntireProcessTree(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to kill process tree for PID {Pid}", SafeProcessId(process));
        }
    }

    private static int SafeProcessId(Process process)
    {
        try { return process.Id; } catch { return -1; }
    }
}
