using System.Diagnostics;

namespace WindowsBuildAgent.Middleware;

/// <summary>
/// Structured audit logging for every request: method, path, caller identity
/// (once authenticated), status code, and duration. Deliberately never logs
/// the Authorization/API-key header value or raw request bodies, since those
/// can contain secrets (the bearer token) or sensitive install command
/// details. Only a redacted marker is logged for the auth header's presence.
/// </summary>
public sealed class RequestLoggingMiddleware
{
    private const string RedactedMarker = "***redacted***";

    private static readonly HashSet<string> SensitiveHeaderNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "Authorization", "X-Api-Key", "Api-Key"
    };

    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var stopwatch = Stopwatch.StartNew();
        var method = context.Request.Method;
        var path = context.Request.Path.Value ?? string.Empty;

        try
        {
            await _next(context).ConfigureAwait(false);
        }
        finally
        {
            stopwatch.Stop();

            var callerIdentity = context.User?.Identity?.IsAuthenticated == true
                ? context.User.Identity.Name ?? "authenticated"
                : "anonymous";

            var statusCode = context.Response?.StatusCode;

            // Never logs header values for sensitive headers, and never
            // logs the request body at all, structured or otherwise —
            // request bodies here can contain install/uninstall command
            // text and package metadata that should not be duplicated into
            // log storage beyond what's needed for the audit trail.
            _logger.LogInformation(
                "HTTP {Method} {Path} caller={Caller} status={StatusCode} durationMs={DurationMs} authHeader={AuthHeaderState}",
                method,
                path,
                callerIdentity,
                statusCode,
                stopwatch.ElapsedMilliseconds,
                DescribeAuthHeaderPresence(context));
        }
    }

    private static string DescribeAuthHeaderPresence(HttpContext context)
    {
        foreach (var headerName in SensitiveHeaderNames)
        {
            if (context.Request.Headers.ContainsKey(headerName))
            {
                return RedactedMarker;
            }
        }

        return "absent";
    }
}

public static class RequestLoggingMiddlewareExtensions
{
    public static IApplicationBuilder UseRequestAuditLogging(this IApplicationBuilder app)
    {
        return app.UseMiddleware<RequestLoggingMiddleware>();
    }
}
