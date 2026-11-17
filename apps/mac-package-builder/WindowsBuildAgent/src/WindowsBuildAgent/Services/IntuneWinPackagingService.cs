using Microsoft.Extensions.Options;

namespace WindowsBuildAgent.Services;

public sealed class IntuneWinAppUtilOptions
{
    public string ExecutablePath { get; set; } = string.Empty;
    public int ProcessTimeoutSeconds { get; set; } = 600;
}

/// <summary>
/// Invokes IntuneWinAppUtil.exe -c &lt;source&gt; -s &lt;setupfile&gt; -o &lt;output&gt; -q
/// via <see cref="IProcessRunner"/>, always with ArgumentList (never a
/// concatenated string). The util itself is referenced only via the
/// admin-configured <see cref="IntuneWinAppUtilOptions.ExecutablePath"/> — it
/// is never expected to live inside a job's source folder. All paths handed
/// to the tool are re-validated here via <see cref="IPathValidationService"/>
/// against the configured job root before use.
/// </summary>
public sealed class IntuneWinPackagingService : IIntuneWinPackagingService
{
    private readonly IProcessRunner _processRunner;
    private readonly IPathValidationService _pathValidator;
    private readonly IntuneWinAppUtilOptions _options;
    private readonly JobStoreOptions _jobStoreOptions;
    private readonly ILogger<IntuneWinPackagingService> _logger;

    public IntuneWinPackagingService(
        IProcessRunner processRunner,
        IPathValidationService pathValidator,
        IOptions<IntuneWinAppUtilOptions> options,
        IOptions<JobStoreOptions> jobStoreOptions,
        ILogger<IntuneWinPackagingService> logger)
    {
        _processRunner = processRunner;
        _pathValidator = pathValidator;
        _options = options.Value;
        _jobStoreOptions = jobStoreOptions.Value;
        _logger = logger;
    }

    public async Task<string> PackageAsync(
        string sourceFolder,
        string setupFileName,
        string outputFolder,
        CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("IntuneWinAppUtil packaging is only supported on Windows.");
        }

        if (string.IsNullOrWhiteSpace(_options.ExecutablePath) || !File.Exists(_options.ExecutablePath))
        {
            throw new IntuneWinPackagingException($"IntuneWinAppUtil.exe was not found at the configured path: {_options.ExecutablePath}");
        }

        // Re-validate the folders against the configured job root even
        // though the caller should already have done so — never trust a
        // path just because it arrived from another internal service.
        var validatedSource = _pathValidator.ValidateAndResolve(_jobStoreOptions.RootDirectory, sourceFolder);
        var validatedOutput = _pathValidator.ValidateAndResolve(_jobStoreOptions.RootDirectory, outputFolder);

        if (!_pathValidator.IsSafeFileName(setupFileName))
        {
            throw new IntuneWinPackagingException($"Setup file name failed validation: {setupFileName}");
        }

        var setupFileFullPath = Path.Combine(validatedSource, setupFileName);
        if (!File.Exists(setupFileFullPath))
        {
            throw new IntuneWinPackagingException($"Setup file not found in source folder: {setupFileName}");
        }

        Directory.CreateDirectory(validatedOutput);

        // Isolated per-job temp working directory, distinct from both the
        // tool's own install location and the job's source/output folders,
        // so concurrent jobs never share scratch state.
        var tempWorkingDirectory = Path.Combine(Path.GetTempPath(), "wba-intunewin-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempWorkingDirectory);

        try
        {
            var arguments = new List<string>
            {
                "-c", validatedSource,
                "-s", setupFileFullPath,
                "-o", validatedOutput,
                "-q" // quiet/non-interactive; never runs the tool's interactive prompts
            };

            var timeout = TimeSpan.FromSeconds(_options.ProcessTimeoutSeconds);
            var result = await _processRunner.RunAsync(_options.ExecutablePath, arguments, tempWorkingDirectory, timeout, cancellationToken)
                .ConfigureAwait(false);

            if (result.TimedOut)
            {
                throw new IntuneWinPackagingException("IntuneWinAppUtil.exe did not complete within the configured timeout.");
            }

            if (result.ExitCode != 0)
            {
                throw new IntuneWinPackagingException($"IntuneWinAppUtil.exe exited with code {result.ExitCode}: {result.StdErr}");
            }

            var expectedName = Path.GetFileNameWithoutExtension(setupFileName) + ".intunewin";
            var produced = Directory.EnumerateFiles(validatedOutput, "*.intunewin", SearchOption.TopDirectoryOnly)
                .OrderByDescending(File.GetLastWriteTimeUtc)
                .FirstOrDefault();

            if (produced is null)
            {
                throw new IntuneWinPackagingException($"IntuneWinAppUtil.exe reported success but no .intunewin file was produced (expected something like {expectedName}).");
            }

            return produced;
        }
        finally
        {
            TryCleanupTempDirectory(tempWorkingDirectory);
        }
    }

    private void TryCleanupTempDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to clean up temp working directory {Path}", path);
        }
    }
}
