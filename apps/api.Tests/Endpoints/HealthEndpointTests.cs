using Microsoft.AspNetCore.Http;
using WebCrawlerApi.Endpoints;

namespace WebCrawlerApi.Tests.Endpoints;

public class HealthEndpointTests
{
    private static (int StatusCode, string Status, string Postgres, string Redis) ExtractResult(IResult result)
    {
        // Use IStatusCodeHttpResult to get status code
        var statusCode = result is IStatusCodeHttpResult sc ? (sc.StatusCode ?? 200) : 200;

        // Use IValueHttpResult to get the value as object
        var value = result is IValueHttpResult vr ? vr.Value : null;
        var json = System.Text.Json.JsonSerializer.Serialize(value);
        var doc = System.Text.Json.JsonDocument.Parse(json);

        return (
            statusCode,
            doc.RootElement.GetProperty("status").GetString()!,
            doc.RootElement.GetProperty("postgres").GetString()!,
            doc.RootElement.GetProperty("redis").GetString()!
        );
    }

    [Fact]
    public async Task CheckHealth_BothHealthy_Returns200WithOkStatus()
    {
        var result = await HealthCheck.CheckHealth(
            () => Task.CompletedTask,
            () => Task.CompletedTask);

        var (statusCode, status, postgres, redis) = ExtractResult(result);
        Assert.Equal(200, statusCode);
        Assert.Equal("ok", status);
        Assert.Equal("ok", postgres);
        Assert.Equal("ok", redis);
    }

    [Fact]
    public async Task CheckHealth_PostgresFails_Returns503WithDegradedStatus()
    {
        var result = await HealthCheck.CheckHealth(
            () => Task.FromException(new Exception("pg down")),
            () => Task.CompletedTask);

        var (statusCode, status, postgres, redis) = ExtractResult(result);
        Assert.Equal(503, statusCode);
        Assert.Equal("degraded", status);
        Assert.Equal("error", postgres);
        Assert.Equal("ok", redis);
    }

    [Fact]
    public async Task CheckHealth_RedisFails_Returns503WithDegradedStatus()
    {
        var result = await HealthCheck.CheckHealth(
            () => Task.CompletedTask,
            () => Task.FromException(new Exception("redis down")));

        var (statusCode, status, postgres, redis) = ExtractResult(result);
        Assert.Equal(503, statusCode);
        Assert.Equal("degraded", status);
        Assert.Equal("ok", postgres);
        Assert.Equal("error", redis);
    }

    [Fact]
    public async Task CheckHealth_BothFail_Returns503WithAllErrorStatus()
    {
        var result = await HealthCheck.CheckHealth(
            () => Task.FromException(new Exception("pg down")),
            () => Task.FromException(new Exception("redis down")));

        var (statusCode, status, postgres, redis) = ExtractResult(result);
        Assert.Equal(503, statusCode);
        Assert.Equal("degraded", status);
        Assert.Equal("error", postgres);
        Assert.Equal("error", redis);
    }
}
