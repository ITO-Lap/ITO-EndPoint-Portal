using WindowsBuildAgent.Services;

namespace WindowsBuildAgent.Endpoints;

/// <summary>GET /winget/search and GET /winget/packages/{id} — read-only WinGet catalog lookups. No write/download happens here; that's a job (see JobEndpoints).</summary>
public static class WinGetEndpoints
{
    public static void MapWinGetEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/winget/search", async (string? q, string? query, IWinGetService winGet, CancellationToken cancellationToken) =>
            {
                var effectiveQuery = query ?? q;
                if (string.IsNullOrWhiteSpace(effectiveQuery))
                {
                    return Results.BadRequest(new { error = "Query parameter 'q' is required." });
                }

                try
                {
                    var results = await winGet.SearchAsync(effectiveQuery, cancellationToken).ConfigureAwait(false);
                    return Results.Ok(results);
                }
                catch (WinGetValidationException ex)
                {
                    return Results.BadRequest(new { error = ex.Message });
                }
            })
            .RequireAuthorization()
            .WithName("WinGetSearch");

        app.MapGet("/winget/packages/{id}", async (string id, string? version, IWinGetService winGet, CancellationToken cancellationToken) =>
            {
                try
                {
                    var detail = await winGet.ShowAsync(id, version, cancellationToken).ConfigureAwait(false);
                    return Results.Ok(detail);
                }
                catch (WinGetValidationException ex)
                {
                    return Results.BadRequest(new { error = ex.Message });
                }
            })
            .RequireAuthorization()
            .WithName("WinGetShow");
    }
}
