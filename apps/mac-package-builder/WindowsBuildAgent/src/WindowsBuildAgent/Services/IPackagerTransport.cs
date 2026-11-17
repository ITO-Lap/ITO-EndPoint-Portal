namespace WindowsBuildAgent.Services;

/// <summary>Moves bytes between this worker and the ITO server over its signed links. Fakeable in tests.</summary>
public interface IPackagerTransport
{
    /// <summary>Downloads <paramref name="url"/> to <paramref name="destinationFile"/>, aborting past <paramref name="maxBytes"/>.</summary>
    Task DownloadAsync(Uri url, string destinationFile, long maxBytes, CancellationToken cancellationToken);

    Task UploadAsync(Uri url, string sourceFile, CancellationToken cancellationToken);
}

public sealed class HttpPackagerTransport : IPackagerTransport
{
    private readonly HttpClient _http;
    public HttpPackagerTransport(HttpClient http) { _http = http; _http.Timeout = TimeSpan.FromHours(2); }

    public async Task DownloadAsync(Uri url, string destinationFile, long maxBytes, CancellationToken cancellationToken)
    {
        using var response = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode) throw new PackagerPolicyException($"Source download failed (HTTP {(int)response.StatusCode}).");
        await using var input = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        await using var output = new FileStream(destinationFile, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        var buffer = new byte[1024 * 1024];
        long total = 0;
        int read;
        while ((read = await input.ReadAsync(buffer, cancellationToken).ConfigureAwait(false)) > 0)
        {
            total += read;
            if (total > maxBytes) throw new PackagerPolicyException("The source exceeds the configured size limit.");
            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken).ConfigureAwait(false);
        }
    }

    public async Task UploadAsync(Uri url, string sourceFile, CancellationToken cancellationToken)
    {
        await using var input = File.OpenRead(sourceFile);
        using var content = new StreamContent(input);
        content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");
        using var response = await _http.PutAsync(url, content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode) throw new PackagerPolicyException($"Package upload was rejected (HTTP {(int)response.StatusCode}).");
    }
}
