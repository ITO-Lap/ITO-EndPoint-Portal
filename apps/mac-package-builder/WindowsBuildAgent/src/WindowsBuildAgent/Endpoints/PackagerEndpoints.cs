using WindowsBuildAgent.Models;
using WindowsBuildAgent.Services;

namespace WindowsBuildAgent.Endpoints;

/// <summary>
/// POST /validate and POST /package — the ITO Windows Package Builder contract. Mapped separately from the original
/// Brew/WinGet job endpoints, which are unchanged. These are typed operations: neither accepts a free-form command to
/// run; commands are validated and resolved by <see cref="PackagerCommandPolicy"/>.
/// </summary>
public static class PackagerEndpoints
{
    public static void MapPackagerEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/validate", async (PackagerValidateRequest request, IPackagerService service, CancellationToken ct) =>
            await Guard(async () => Results.Ok(await service.ValidateAsync(request, ct).ConfigureAwait(false)))).RequireAuthorization().WithName("PackagerValidate");

        app.MapPost("/package", async (PackagerPackageRequest request, IPackagerService service, CancellationToken ct) =>
            await Guard(async () => Results.Ok(await service.PackageAsync(request, ct).ConfigureAwait(false)))).RequireAuthorization().WithName("PackagerPackage");
    }

    private static async Task<IResult> Guard(Func<Task<IResult>> action)
    {
        try { return await action().ConfigureAwait(false); }
        catch (PackagerPolicyException ex) { return Results.BadRequest(new { error = ex.Message }); }
        catch (OperationCanceledException) { return Results.StatusCode(StatusCodes.Status499ClientClosedRequest); }
    }
}
