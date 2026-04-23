using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using StackExchange.Redis;
using WebCrawlerApi.Data;
using WebCrawlerApi.Data.Entities;
using WebCrawlerApi.Hubs;
using WebCrawlerApi.Models.Responses;
using WebCrawlerApi.Parsers;
using WebCrawlerApi.Services;

namespace WebCrawlerApi.Tests.Services;

public class CrawlerEventListenerBroadcastTests
{
    private static AppDbContext CreateDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase("broadcast_" + Guid.NewGuid())
            .Options);

    private static (CrawlerEventListener listener,
                    Mock<IHubClients> clients,
                    Mock<IClientProxy> clientProxy)
        BuildListener()
    {
        var clientProxy = new Mock<IClientProxy>();
        clientProxy
            .Setup(c => c.SendCoreAsync(
                It.IsAny<string>(),
                It.IsAny<object?[]>(),
                It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var clients = new Mock<IHubClients>();
        clients.Setup(c => c.All).Returns(clientProxy.Object);

        var hubContext = new Mock<IHubContext<DashboardHub>>();
        hubContext.Setup(h => h.Clients).Returns(clients.Object);

        var scopeFactory = new ServiceCollection()
            .AddScoped<AppDbContext>(_ => CreateDb())
            .BuildServiceProvider()
            .GetRequiredService<IServiceScopeFactory>();

        var redis = new Mock<IConnectionMultiplexer>();
        var config = new ConfigurationBuilder().Build();

        var listener = new CrawlerEventListener(
            scopeFactory,
            redis.Object,
            config,
            hubContext.Object,
            NullLogger<CrawlerEventListener>.Instance);

        return (listener, clients, clientProxy);
    }

    private static async Task<AppDbContext> SeedUpsertedEntryAsync(Guid sourceId, string entryKey)
    {
        var db = CreateDb();
        db.DataEntries.Add(new DataEntry
        {
            Id = Guid.NewGuid(),
            SourceId = sourceId,
            Category = "football",
            EntryKey = entryKey,
            Payload = JsonDocument.Parse("{\"name\":\"fixture\"}"),
            CrawledAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
        return db;
    }

    [Fact]
    public async Task Broadcast_FiresAfterUpsert_SendsNewEntryEventOnce()
    {
        var (listener, _, clientProxy) = BuildListener();
        var sourceId = Guid.NewGuid();
        var entryKey = "match_42";
        await using var db = await SeedUpsertedEntryAsync(sourceId, entryKey);

        var entry = new ParsedEntry(
            SourceId: sourceId.ToString(),
            EntryKey: entryKey,
            Category: "football",
            Payload: new Dictionary<string, object> { ["name"] = "fixture" });

        await listener.EvaluateAndNotifyAsync(
            db, sourceId, entry, oldPayload: null, jobId: "job-1", CancellationToken.None);

        clientProxy.Verify(
            p => p.SendCoreAsync(
                "NewEntry",
                It.Is<object?[]>(args => args.Length == 1 && args[0] is DataEntryResponse),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Broadcast_PayloadIsDataEntryResponse_WithValidPayloadElement()
    {
        var (listener, _, clientProxy) = BuildListener();
        var sourceId = Guid.NewGuid();
        var entryKey = "match_99";
        await using var db = await SeedUpsertedEntryAsync(sourceId, entryKey);

        DataEntryResponse? captured = null;
        clientProxy
            .Setup(p => p.SendCoreAsync(
                "NewEntry",
                It.IsAny<object?[]>(),
                It.IsAny<CancellationToken>()))
            .Callback<string, object?[], CancellationToken>((_, args, _) =>
                captured = args[0] as DataEntryResponse)
            .Returns(Task.CompletedTask);

        var entry = new ParsedEntry(
            SourceId: sourceId.ToString(),
            EntryKey: entryKey,
            Category: "football",
            Payload: new Dictionary<string, object> { ["name"] = "fixture" });

        await listener.EvaluateAndNotifyAsync(
            db, sourceId, entry, oldPayload: null, jobId: "job-1", CancellationToken.None);

        Assert.NotNull(captured);
        Assert.Equal(sourceId, captured!.SourceId);
        Assert.Equal(entryKey, captured.EntryKey);
        Assert.NotEqual(JsonValueKind.Undefined, captured.Payload.ValueKind);
    }

    [Fact]
    public async Task Broadcast_WhenSendAsyncThrows_DoesNotBubbleException()
    {
        var (listener, _, clientProxy) = BuildListener();
        clientProxy
            .Setup(p => p.SendCoreAsync(
                It.IsAny<string>(),
                It.IsAny<object?[]>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("simulated transport failure"));

        var sourceId = Guid.NewGuid();
        var entryKey = "match_err";
        await using var db = await SeedUpsertedEntryAsync(sourceId, entryKey);

        var entry = new ParsedEntry(
            SourceId: sourceId.ToString(),
            EntryKey: entryKey,
            Category: "football",
            Payload: new Dictionary<string, object> { ["name"] = "fixture" });

        // Must not throw — broadcast errors are swallowed + logged
        await listener.EvaluateAndNotifyAsync(
            db, sourceId, entry, oldPayload: null, jobId: "job-1", CancellationToken.None);
    }
}
