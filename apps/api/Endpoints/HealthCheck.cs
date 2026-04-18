using Microsoft.AspNetCore.Http.HttpResults;

namespace WebCrawlerApi.Endpoints;

public static class HealthCheck
{
    public static async Task<IResult> CheckHealth(
        Func<Task> pgProbe,
        Func<Task> redisProbe)
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
        var body = new { status = overall, postgres = pgStatus, redis = redisStatus };

        return overall == "ok"
            ? Results.Ok(body)
            : Results.Json(body, statusCode: 503);
    }
}
