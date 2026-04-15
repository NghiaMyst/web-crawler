using System.Net;
using Microsoft.Extensions.Logging;
using Moq;
using WebCrawlerApi.Services;
using WebCrawlerApi.Tests.Helpers;

namespace WebCrawlerApi.Tests.Services;

public class TelegramSenderTests : IDisposable
{
    public TelegramSenderTests()
    {
        Environment.SetEnvironmentVariable("TELEGRAM_BOT_TOKEN", "test-token");
        Environment.SetEnvironmentVariable("TELEGRAM_CHAT_ID", "CHAT123");
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("TELEGRAM_BOT_TOKEN", null);
        Environment.SetEnvironmentVariable("TELEGRAM_CHAT_ID", null);
    }

    private static TelegramSender CreateSender(MockHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler);
        var logger = new Mock<ILogger<TelegramSender>>().Object;
        return new TelegramSender(httpClient, logger);
    }

    [Fact]
    public async Task SendAsync_Success_ReturnsTrue()
    {
        // Arrange
        var handler = new MockHttpMessageHandler(HttpStatusCode.OK);
        var sender = CreateSender(handler);

        // Act
        var result = await sender.SendAsync("Test message", CancellationToken.None);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public async Task SendAsync_PostsCorrectUrl()
    {
        // Arrange
        var handler = new MockHttpMessageHandler(HttpStatusCode.OK);
        var sender = CreateSender(handler);

        // Act
        await sender.SendAsync("hello", CancellationToken.None);

        // Assert: URL must include bot token path
        Assert.NotNull(handler.LastRequest);
        Assert.Contains("api.telegram.org/bottest-token/sendMessage",
            handler.LastRequest!.RequestUri!.ToString());
    }

    [Fact]
    public async Task SendAsync_PostsCorrectBody()
    {
        // Arrange
        var handler = new MockHttpMessageHandler(HttpStatusCode.OK);
        var sender = CreateSender(handler);

        // Act
        await sender.SendAsync("hello", CancellationToken.None);

        // Assert: body must have chat_id and text fields
        Assert.NotNull(handler.LastRequestBody);
        Assert.Contains("\"chat_id\"", handler.LastRequestBody);
        Assert.Contains("CHAT123", handler.LastRequestBody);
        Assert.Contains("\"text\"", handler.LastRequestBody);
        Assert.Contains("hello", handler.LastRequestBody);
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
    public async Task SendAsync_MissingToken_ReturnsFalse()
    {
        // Arrange: clear env vars so credentials are not configured
        Environment.SetEnvironmentVariable("TELEGRAM_BOT_TOKEN", null);
        Environment.SetEnvironmentVariable("TELEGRAM_CHAT_ID", null);
        var handler = new MockHttpMessageHandler(HttpStatusCode.OK);
        var sender = CreateSender(handler);

        // Act
        var result = await sender.SendAsync("Test message", CancellationToken.None);

        // Assert: returns false immediately without making any HTTP request
        Assert.False(result);
        Assert.Null(handler.LastRequest); // no HTTP call made
    }
}
