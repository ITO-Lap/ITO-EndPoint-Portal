using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using WindowsBuildAgent.Auth;
using WindowsBuildAgent.Endpoints;
using WindowsBuildAgent.Middleware;
using WindowsBuildAgent.Services;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------------
// Kestrel: HTTPS only. No plaintext HTTP endpoint is ever configured or
// listened on. Certificate path/password come from appsettings.json /
// environment-specific overrides (see appsettings.json's "Kestrel" section
// and README.md for cert provisioning). Request size is capped so a
// malicious or buggy client cannot exhaust memory/disk with an oversized
// request body.
// ---------------------------------------------------------------------
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = builder.Configuration.GetValue<long?>("Kestrel:Limits:MaxRequestBodySize") ?? 5 * 1024 * 1024;
    options.Limits.MaxConcurrentConnections = builder.Configuration.GetValue<long?>("Kestrel:Limits:MaxConcurrentConnections") ?? 100;
    options.Limits.MaxConcurrentUpgradedConnections = builder.Configuration.GetValue<long?>("Kestrel:Limits:MaxConcurrentUpgradedConnections") ?? 100;

    // ConfigureHttpsDefaults enforces at least TLS 1.2 for every HTTPS
    // endpoint configured via the "Kestrel:Endpoints" section in
    // appsettings.json (Kestrel's configuration binder wires those up
    // automatically from WebHost.ConfigureKestrel + appsettings; no
    // "Endpoints" without a Certificate section will bind, so there is no
    // accidental plaintext listener).
    options.ConfigureHttpsDefaults(httpsOptions =>
    {
        httpsOptions.SslProtocols = System.Security.Authentication.SslProtocols.Tls12 | System.Security.Authentication.SslProtocols.Tls13;
    });
});

// ---------------------------------------------------------------------
// Options binding
// ---------------------------------------------------------------------
builder.Services.Configure<WinGetOptions>(builder.Configuration.GetSection("WinGet"));
builder.Services.Configure<IntuneWinAppUtilOptions>(builder.Configuration.GetSection("IntuneWinAppUtil"));
builder.Services.Configure<JobStoreOptions>(builder.Configuration.GetSection("JobStore"));
builder.Services.Configure<AgentInfoOptions>(builder.Configuration.GetSection("AgentInfo"));
builder.Services.Configure<PackagerOptions>(builder.Configuration.GetSection("Packager"));

// ---------------------------------------------------------------------
// Authentication: API-key bearer scheme is the ONLY authentication scheme,
// and it is required by default for every endpoint (FallbackPolicy) unless
// an endpoint explicitly opts out. No endpoint below opts out — even
// /health requires a valid key, per "no endpoint is unauthenticated by
// accident."
// ---------------------------------------------------------------------
builder.Services
    .AddAuthentication(ApiKeyAuthConstants.ApiKeySchemeName)
    .AddScheme<ApiKeyAuthSchemeOptions, ApiKeyAuthHandler>(ApiKeyAuthConstants.ApiKeySchemeName, options =>
    {
        options.ApiKeyHashHex = builder.Configuration["AgentAuth:ApiKeyHashHex"] ?? string.Empty;
        options.HeaderName = builder.Configuration["AgentAuth:ApiKeyHeaderName"] ?? "Authorization";
        options.Scheme = builder.Configuration["AgentAuth:ApiKeyHeaderScheme"] ?? "Bearer";
    });

builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build());

// ---------------------------------------------------------------------
// Application services. IProcessRunner and friends are the only way any
// external executable is ever invoked in this project.
// ---------------------------------------------------------------------
builder.Services.AddSingleton<IProcessRunner, ProcessRunner>();
builder.Services.AddSingleton<IPathValidationService, PathValidationService>();
builder.Services.AddSingleton<IWinGetService, WinGetService>();
builder.Services.AddSingleton<IAuthenticodeService, AuthenticodeService>();
builder.Services.AddSingleton<IMsiInspectionService, MsiInspectionService>();
builder.Services.AddSingleton<IIntuneWinPackagingService, IntuneWinPackagingService>();

// ITO Windows Package Builder contract (POST /validate, POST /package); additive to the Brew/WinGet endpoints.
builder.Services.AddHttpClient<IPackagerTransport, HttpPackagerTransport>();
builder.Services.AddSingleton<IPackagerService>(sp => new PackagerService(
    sp.GetRequiredService<IProcessRunner>(), sp.GetRequiredService<IPackagerTransport>(),
    sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<PackagerOptions>>(), sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<IntuneWinAppUtilOptions>>(),
    sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<AgentInfoOptions>>(), sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<JobStoreOptions>>()));

// JobStore is registered both as the interface (for endpoint/service
// consumers) and its concrete type (for the retention sweep background
// service, which needs the internal SweepExpiredJobs method) — both
// resolve to the same singleton instance.
builder.Services.AddSingleton<JobStore>();
builder.Services.AddSingleton<IJobStore>(sp => sp.GetRequiredService<JobStore>());
builder.Services.AddHostedService<JobRetentionSweepService>();

builder.Services.AddEndpointsApiExplorer();

var app = builder.Build();

// Structured audit logging (method/path/caller/outcome, secrets redacted)
// runs before authentication so even rejected/unauthenticated attempts are
// audited.
app.UseRequestAuditLogging();

app.UseAuthentication();
app.UseAuthorization();

// Exactly the 8 documented endpoints. No generic command/exec endpoint is
// mapped anywhere in this project — see
// tests/WindowsBuildAgent.Tests/UnauthorizedCommandRejectionTests.cs, which
// asserts the route table doesn't contain one.
app.MapHealthEndpoints();
app.MapWinGetEndpoints();
app.MapJobEndpoints();
app.MapPackagerEndpoints();

app.Run();

// Exposed for WebApplicationFactory-style integration tests.
public partial class Program { }
