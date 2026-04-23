using Microsoft.AspNetCore.Http.HttpResults;

namespace WebCrawlerApi.Endpoints;

public static class HealthCheck
{
    /// <summary>
    /// Runs probes and returns a /health JSON response.
    /// `hubConnections` is informational only — it NEVER changes the overall status,
    /// ensuring a hub with zero live clients does not trip monitoring alerts.
    /// Default value 0 preserves backward compatibility with existing tests
    /// (see RESEARCH Open Question #2).
    /// </summary>
    public static async Task<IResult> CheckHealth(
        Func<Task> pgProbe,
        Func<Task> redisProbe,
        int hubConnections = 0)
    {
        string pgStatus, redisStatus;

        try
        {
            await pgProbe();
            pgStatus = "ok";
        }
        catch
        {
            pgStatus = "error";
        }

        try
        {
            await redisProbe();
            redisStatus = "ok";
        }
        catch
        {
            redisStatus = "error";
        }

        var overall = (pgStatus == "ok" && redisStatus == "ok") ? "ok" : "degraded";
        var body = new
        {
            status = overall,
            postgres = pgStatus,
            redis = redisStatus,
            hub_connections = hubConnections
        };

        return overall == "ok"
            ? Results.Ok(body)
            : Results.Json(body, statusCode: 503);
    }
}
