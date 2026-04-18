using Microsoft.AspNetCore.Http.HttpResults;
using WebCrawlerApi.Endpoints;

namespace WebCrawlerApi.Tests.Endpoints;

public class HealthEndpointTests
{
    [Fact]
    public async Task CheckHealth_BothHealthy_Returns200WithOkStatus()
    {
        var result = await HealthCheck.CheckHealth(
            () => Task.CompletedTask,
            () => Task.CompletedTask);

        var ok = Assert.IsType<Ok<object>>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(ok.Value);
        var doc = System.Text.Json.JsonDocument.Parse(json);
        Assert.Equal("ok", doc.RootElement.GetProperty("status").GetString());
        Assert.Equal("ok", doc.RootElement.GetProperty("postgres").GetString());
        Assert.Equal("ok", doc.RootElement.GetProperty("redis").GetString());
    }

    [Fact]
    public async Task CheckHealth_PostgresFails_Returns503WithDegradedStatus()
    {
        var result = await HealthCheck.CheckHealth(
            () => Task.FromException(new Exception("pg down")),
            () => Task.CompletedTask);

        var json503 = Assert.IsType<JsonHttpResult<object>>(result);
        Assert.Equal(503, json503.StatusCode);
        var json = System.Text.Json.JsonSerializer.Serialize(json503.Value);
        var doc = System.Text.Json.JsonDocument.Parse(json);
        Assert.Equal("degraded", doc.RootElement.GetProperty("status").GetString());
        Assert.Equal("error", doc.RootElement.GetProperty("postgres").GetString());
        Assert.Equal("ok", doc.RootElement.GetProperty("redis").GetString());
    }

    [Fact]
    public async Task CheckHealth_RedisFails_Returns503WithDegradedStatus()
    {
        var result = await HealthCheck.CheckHealth(
            () => Task.CompletedTask,
            () => Task.FromException(new Exception("redis down")));

        var json503 = Assert.IsType<JsonHttpResult<object>>(result);
        Assert.Equal(503, json503.StatusCode);
        var json = System.Text.Json.JsonSerializer.Serialize(json503.Value);
        var doc = System.Text.Json.JsonDocument.Parse(json);
        Assert.Equal("degraded", doc.RootElement.GetProperty("status").GetString());
        Assert.Equal("ok", doc.RootElement.GetProperty("postgres").GetString());
        Assert.Equal("error", doc.RootElement.GetProperty("redis").GetString());
    }

    [Fact]
    public async Task CheckHealth_BothFail_Returns503WithAllErrorStatus()
    {
        var result = await HealthCheck.CheckHealth(
            () => Task.FromException(new Exception("pg down")),
            () => Task.FromException(new Exception("redis down")));

        var json503 = Assert.IsType<JsonHttpResult<object>>(result);
        Assert.Equal(503, json503.StatusCode);
        var json = System.Text.Json.JsonSerializer.Serialize(json503.Value);
        var doc = System.Text.Json.JsonDocument.Parse(json);
        Assert.Equal("degraded", doc.RootElement.GetProperty("status").GetString());
        Assert.Equal("error", doc.RootElement.GetProperty("postgres").GetString());
        Assert.Equal("error", doc.RootElement.GetProperty("redis").GetString());
    }
}
