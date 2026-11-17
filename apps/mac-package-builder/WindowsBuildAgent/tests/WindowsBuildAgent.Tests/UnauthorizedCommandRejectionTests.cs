using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using WindowsBuildAgent.Endpoints;
using Xunit;

namespace WindowsBuildAgent.Tests;

/// <summary>
/// Asserts the agent's route table contains exactly the 8 documented
/// endpoints and nothing else — in particular, no generic "run this
/// command"/"exec"/"shell" endpoint exists anywhere. This test maps the
/// same extension methods Program.cs uses
/// (MapHealthEndpoints/MapWinGetEndpoints/MapJobEndpoints) onto a bare
/// WebApplication so it can inspect the resulting route table without
/// needing a live Kestrel/HTTPS listener, real winget/IntuneWinAppUtil
/// binaries, or any configured secrets — mapping routes does not resolve
/// per-request DI dependencies, only invoking a handler does.
/// </summary>
public sealed class UnauthorizedCommandRejectionTests
{
    private static readonly (string Method, string Pattern)[] ExpectedRoutes =
    {
        ("GET", "/health"),
        ("GET", "/winget/search"),
        ("GET", "/winget/packages/{id}"),
        ("POST", "/jobs/download"),
        ("POST", "/jobs/package"),
        ("GET", "/jobs/{id}"),
        ("POST", "/jobs/{id}/cancel"),
        ("GET", "/jobs/{id}/artifacts"),
    };

    private static readonly string[] ForbiddenPathFragments =
    {
        "exec", "command", "cmd", "shell", "run", "eval", "script", "powershell", "invoke"
    };

    private static WebApplication BuildAppWithMappedEndpoints()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddRouting();
        var app = builder.Build();

        app.MapHealthEndpoints();
        app.MapWinGetEndpoints();
        app.MapJobEndpoints();

        return app;
    }

    private static IReadOnlyList<(string Method, string Pattern)> GetRouteTable(WebApplication app)
    {
        var dataSource = app.Services.GetRequiredService<EndpointDataSource>();
        var routes = new List<(string Method, string Pattern)>();

        foreach (var endpoint in dataSource.Endpoints)
        {
            if (endpoint is not RouteEndpoint routeEndpoint) continue;

            var httpMethods = routeEndpoint.Metadata.GetMetadata<Microsoft.AspNetCore.Routing.HttpMethodMetadata>()?.HttpMethods
                ?? new List<string> { "UNKNOWN" };

            foreach (var method in httpMethods)
            {
                routes.Add((method, routeEndpoint.RoutePattern.RawText ?? string.Empty));
            }
        }

        return routes;
    }

    [Fact]
    public void RouteTable_ContainsExactlyTheEightDocumentedEndpoints()
    {
        using var app = BuildAppWithMappedEndpoints();
        var routes = GetRouteTable(app);

        Assert.Equal(ExpectedRoutes.Length, routes.Count);

        foreach (var expected in ExpectedRoutes)
        {
            Assert.Contains(routes, r => r.Method == expected.Method && r.Pattern == expected.Pattern);
        }
    }

    [Fact]
    public void RouteTable_ContainsNoGenericCommandOrExecEndpoint()
    {
        using var app = BuildAppWithMappedEndpoints();
        var routes = GetRouteTable(app);

        foreach (var (_, pattern) in routes)
        {
            foreach (var forbidden in ForbiddenPathFragments)
            {
                Assert.DoesNotContain(forbidden, pattern, StringComparison.OrdinalIgnoreCase);
            }
        }
    }

    [Fact]
    public void RouteTable_HasNoRouteAcceptingAnHttpVerbOtherThanGetOrPost()
    {
        using var app = BuildAppWithMappedEndpoints();
        var routes = GetRouteTable(app);

        Assert.All(routes, r => Assert.True(r.Method is "GET" or "POST"));
    }
}
