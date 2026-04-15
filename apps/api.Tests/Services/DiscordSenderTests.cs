using System.Net;
using Microsoft.Extensions.Logging;
using Moq;
using WebCrawlerApi.Services;
using WebCrawlerApi.Tests.Helpers;

namespace WebCrawlerApi.Tests.Services;

public class DiscordSenderTests : IDisposable
{
    private const string TestWebhookUrl = "https://discord.com/api/webhooks/test/token";

    public DiscordSenderTests()
    {
        Environment.SetEnvironmentVariable("DISCORD_WEBHOOK_URL", TestWebhookUrl);
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("DISCORD_WEBHOOK_URL", null);
    }

    private static DiscordSender CreateSender(MockHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler);
        var logger = new Mock<ILogger<DiscordSender>>().Object;
        return new DiscordSender(httpClient, logger);
    }

    [Fact]
    public async Task SendAsync_Success_ReturnsTrue()
    {
        // Arrange: Discord webhooks return 204 No Content on success
        var handler = new MockHttpMessageHandler(HttpStatusCode.NoContent);
        var sender = CreateSender(handler);

        // Act
        var result = await sender.SendAsync("Test message", CancellationToken.None);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public async Task SendAsync_PostsCorrectBody()
    {
        // Arrange
        var handler = new MockHttpMessageHandler(HttpStatusCode.NoContent);
        var sender = CreateSender(handler);

        // Act
        await sender.SendAsync("hello world", CancellationToken.None);

        // Assert: body must have "content" field (not "text")
        Assert.NotNull(handler.LastRequestBody);
        Assert.Contains("\"content\"", handler.LastRequestBody);
        Assert.Contains("hello world", handler.LastRequestBody);
    }

    [Fact]
    public async Task SendAsync_HttpError_ReturnsFalse()
    {
        // Arrange
        var handler = new MockHttpMessageHandler(HttpStatusCode.InternalServerError);
        var sender = CreateSender(handler);

        // Act
        var result = await sender.SendAsync("Test message", CancellationToken.None);

        // Assert: must return false without throwing
        Assert.False(result);
    }

    [Fact]
    public async Task SendAsync_MissingWebhookUrl_ReturnsFalse()
    {
        // Arrange: clear env var so it's not configured
        Environment.SetEnvironmentVariable("DISCORD_WEBHOOK_URL", null);
        var handler = new MockHttpMessageHandler(HttpStatusCode.NoContent);
        var sender = CreateSender(handler);

        // Act
        var result = await sender.SendAsync("Test message", CancellationToken.None);

        // Assert: returns false immediately without making any HTTP request
        Assert.False(result);
        Assert.Null(handler.LastRequest); // no HTTP call made
    }

    [Fact]
    public async Task SendAsync_429RateLimit_ReturnsFalse()
    {
        // Arrange
        var handler = new MockHttpMessageHandler((HttpStatusCode)429);
        var loggerMock = new Mock<ILogger<DiscordSender>>();
        var httpClient = new HttpClient(handler);
        var sender = new DiscordSender(httpClient, loggerMock.Object);

        // Act
        var result = await sender.SendAsync("Test message", CancellationToken.None);

        // Assert: returns false, and a warning was logged
        Assert.False(result);
        loggerMock.Verify(
            x => x.Log(
                LogLevel.Warning,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, _) => true),
                It.IsAny<Exception?>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.AtLeastOnce);
    }
}
