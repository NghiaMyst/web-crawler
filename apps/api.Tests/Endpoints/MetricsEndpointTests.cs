using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using StackExchange.Redis;
using Moq;
using WebCrawlerApi.Data;
using WebCrawlerApi.Services;
using Xunit;

namespace WebCrawlerApi.Tests.Endpoints;

/// <summary>
/// Integration tests for the Prometheus /metrics endpoint added by prometheus-net.
/// Uses WebApplicationFactory with an in-memory database to avoid real DB connections.
/// </summary>
public class MetricsEndpointTests : IClassFixture<MetricsTestFactory>
{
    private readonly HttpClient _client;

    public MetricsEndpointTests(MetricsTestFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetMetrics_Returns200()
    {
        var response = await _client.GetAsync("/metrics");
        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetMetrics_ContentTypeIsTextPlain()
    {
        var response = await _client.GetAsync("/metrics");
        var contentType = response.Content.Headers.ContentType?.MediaType ?? "";
        Assert.Equal("text/plain", contentType);
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task GetMetrics_AfterRequest_ContainsHttpRequestsCounter()
    {
        // Generate a request to increment the counter
        await _client.GetAsync("/health");

        // Now check /metrics contains the counter
        var response = await _client.GetAsync("/metrics");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Contains("http_requests_received_total", body);
    }
}

/// <summary>
/// Custom WebApplicationFactory that replaces PostgreSQL + Redis with in-memory equivalents
/// so tests can run without a real database connection.
/// </summary>
public class MetricsTestFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            // Remove the real DbContext registration
            var dbDescriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
            if (dbDescriptor != null)
                services.Remove(dbDescriptor);

            var dbContextDescriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(AppDbContext));
            if (dbContextDescriptor != null)
                services.Remove(dbContextDescriptor);

            // Add in-memory database
            services.AddDbContext<AppDbContext>(opt =>
                opt.UseInMemoryDatabase("MetricsTestDb"));

            // Remove real Redis registration
            var redisDescriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(IConnectionMultiplexer));
            if (redisDescriptor != null)
                services.Remove(redisDescriptor);

            // Add mock Redis
            var mockRedis = new Mock<IConnectionMultiplexer>();
            var mockDb = new Mock<IDatabase>();
            mockDb.Setup(d => d.PingAsync(It.IsAny<CommandFlags>()))
                  .ReturnsAsync(TimeSpan.FromMilliseconds(1));
            mockRedis.Setup(r => r.GetDatabase(It.IsAny<int>(), It.IsAny<object>()))
                     .Returns(mockDb.Object);
            services.AddSingleton(mockRedis.Object);

            // Remove CrawlerEventListener background service — it connects directly to
            // PostgreSQL via NpgsqlConnection and crashes the test host (StopHost behavior).
            var crawlerListenerDescriptor = services.SingleOrDefault(
                d => d.ImplementationType == typeof(CrawlerEventListener));
            if (crawlerListenerDescriptor != null)
                services.Remove(crawlerListenerDescriptor);
        });
    }
}
