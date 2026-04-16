using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using WebCrawlerApi.Data;
using WebCrawlerApi.Data.Entities;
using WebCrawlerApi.Models.Notifications;
using WebCrawlerApi.Services;

namespace WebCrawlerApi.Tests.Services;

public class NotificationDispatcherTests
{
    private static AppDbContext CreateDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase("test_" + Guid.NewGuid())
            .Options);

    private static AlertRule MakeRule(string channel, string condType, string messageTpl = "Alert: {name}") =>
        new AlertRule
        {
            Id = Guid.NewGuid(),
            SourceId = Guid.NewGuid(),
            Name = "Test Rule",
            Condition = JsonDocument.Parse($"{{\"type\":\"{condType}\"}}"),
            MessageTpl = messageTpl,
            Channel = channel,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };

    private static DiffResult NewItemDiff() =>
        new DiffResult(IsNewEntry: true, ChangedFields: new Dictionary<string, FieldChange>());

    private static JsonDocument NewPayload(string name = "test-item") =>
        JsonDocument.Parse($"{{\"name\":\"{name}\"}}");

    [Fact]
    public async Task DispatchAsync_NewItemRule_TelegramSent_LogsSuccess()
    {
        // Arrange
        using var db = CreateDb();
        var rule = MakeRule("telegram", "new_item");
        db.AlertRules.Add(rule);
        await db.SaveChangesAsync();

        var telegramMock = new Mock<INotificationSender>();
        telegramMock.Setup(s => s.ChannelName).Returns("telegram");
        telegramMock.Setup(s => s.SendAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var evaluator = new AlertRuleEvaluator(db);
        var dispatcher = new NotificationDispatcher(
            evaluator,
            new[] { telegramMock.Object },
            NullLogger<NotificationDispatcher>.Instance);

        var dataEntryId = Guid.NewGuid();
        var diff = NewItemDiff();
        using var payload = NewPayload();

        // Act
        await dispatcher.DispatchAsync(db, rule.SourceId, dataEntryId, diff, payload, CancellationToken.None);

        // Assert
        var logs = await db.NotificationLogs.ToListAsync();
        Assert.Single(logs);
        Assert.Equal("sent", logs[0].Status);
        Assert.Equal("telegram", logs[0].Channel);
        telegramMock.Verify(s => s.SendAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task DispatchAsync_FieldChangedRule_DiscordSent_LogsSuccess()
    {
        // Arrange
        using var db = CreateDb();
        var rule = new AlertRule
        {
            Id = Guid.NewGuid(),
            SourceId = Guid.NewGuid(),
            Name = "Field Changed Rule",
            Condition = JsonDocument.Parse("{\"type\":\"field_changed\",\"field\":\"version\"}"),
            MessageTpl = "Version changed: {name}",
            Channel = "discord",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.AlertRules.Add(rule);
        await db.SaveChangesAsync();

        var discordMock = new Mock<INotificationSender>();
        discordMock.Setup(s => s.ChannelName).Returns("discord");
        discordMock.Setup(s => s.SendAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var evaluator = new AlertRuleEvaluator(db);
        var dispatcher = new NotificationDispatcher(
            evaluator,
            new[] { discordMock.Object },
            NullLogger<NotificationDispatcher>.Instance);

        var dataEntryId = Guid.NewGuid();
        // field_changed diff with "version" field
        var changedFields = new Dictionary<string, FieldChange>
        {
            ["version"] = new FieldChange(
                JsonDocument.Parse("\"1.0\"").RootElement,
                JsonDocument.Parse("\"2.0\"").RootElement)
        };
        var diff = new DiffResult(IsNewEntry: false, ChangedFields: changedFields);
        using var payload = JsonDocument.Parse("{\"name\":\"test\",\"version\":\"2.0\"}");

        // Act
        await dispatcher.DispatchAsync(db, rule.SourceId, dataEntryId, diff, payload, CancellationToken.None);

        // Assert
        var logs = await db.NotificationLogs.ToListAsync();
        Assert.Single(logs);
        Assert.Equal("discord", logs[0].Channel);
        Assert.Equal("sent", logs[0].Status);
    }

    [Fact]
    public async Task DispatchAsync_DeliveryFails_LogsFailed()
    {
        // Arrange
        using var db = CreateDb();
        var rule = MakeRule("telegram", "new_item");
        db.AlertRules.Add(rule);
        await db.SaveChangesAsync();

        var telegramMock = new Mock<INotificationSender>();
        telegramMock.Setup(s => s.ChannelName).Returns("telegram");
        telegramMock.Setup(s => s.SendAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var evaluator = new AlertRuleEvaluator(db);
        var dispatcher = new NotificationDispatcher(
            evaluator,
            new[] { telegramMock.Object },
            NullLogger<NotificationDispatcher>.Instance);

        var dataEntryId = Guid.NewGuid();
        var diff = NewItemDiff();
        using var payload = NewPayload();

        // Act
        await dispatcher.DispatchAsync(db, rule.SourceId, dataEntryId, diff, payload, CancellationToken.None);

        // Assert
        var logs = await db.NotificationLogs.ToListAsync();
        Assert.Single(logs);
        Assert.Equal("failed", logs[0].Status);
    }

    [Fact]
    public async Task DispatchAsync_DedupGuard_SkipsDuplicate()
    {
        // Arrange
        using var db = CreateDb();
        var rule = MakeRule("telegram", "new_item");
        db.AlertRules.Add(rule);

        var dataEntryId = Guid.NewGuid();

        // Insert a recent sent log (< 5 min old)
        db.NotificationLogs.Add(new NotificationLog
        {
            Id = Guid.NewGuid(),
            AlertRuleId = rule.Id,
            DataEntryId = dataEntryId,
            Channel = "telegram",
            Message = "previous message",
            Status = "sent",
            SentAt = DateTimeOffset.UtcNow.AddMinutes(-2)
        });
        await db.SaveChangesAsync();

        var telegramMock = new Mock<INotificationSender>();
        telegramMock.Setup(s => s.ChannelName).Returns("telegram");

        var evaluator = new AlertRuleEvaluator(db);
        var dispatcher = new NotificationDispatcher(
            evaluator,
            new[] { telegramMock.Object },
            NullLogger<NotificationDispatcher>.Instance);

        var diff = NewItemDiff();
        using var payload = NewPayload();

        // Act
        await dispatcher.DispatchAsync(db, rule.SourceId, dataEntryId, diff, payload, CancellationToken.None);

        // Assert: sender should NOT be called (dedup guard triggers)
        telegramMock.Verify(s => s.SendAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task DispatchAsync_RetryOnFailure_UpTo2Retries()
    {
        // Arrange
        using var db = CreateDb();
        var rule = MakeRule("telegram", "new_item");
        db.AlertRules.Add(rule);
        await db.SaveChangesAsync();

        var callCount = 0;
        var telegramMock = new Mock<INotificationSender>();
        telegramMock.Setup(s => s.ChannelName).Returns("telegram");
        telegramMock.Setup(s => s.SendAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(() =>
            {
                callCount++;
                return callCount >= 3; // fail first 2, succeed on 3rd
            });

        var evaluator = new AlertRuleEvaluator(db);
        var dispatcher = new NotificationDispatcher(
            evaluator,
            new[] { telegramMock.Object },
            NullLogger<NotificationDispatcher>.Instance);

        var dataEntryId = Guid.NewGuid();
        var diff = NewItemDiff();
        using var payload = NewPayload();

        // Act
        await dispatcher.DispatchAsync(db, rule.SourceId, dataEntryId, diff, payload, CancellationToken.None);

        // Assert: called 3 times total (1 initial + 2 retries), final status "sent"
        telegramMock.Verify(s => s.SendAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Exactly(3));
        var logs = await db.NotificationLogs.ToListAsync();
        Assert.Single(logs);
        Assert.Equal("sent", logs[0].Status);
    }

    [Fact]
    public async Task DispatchAsync_EmptyMessage_SkipsSend()
    {
        // Arrange
        using var db = CreateDb();
        // Rule with empty MessageTpl -- BuildMessage returns null for whitespace-only templates
        var rule = MakeRule("telegram", "new_item", messageTpl: "");
        db.AlertRules.Add(rule);
        await db.SaveChangesAsync();

        var telegramMock = new Mock<INotificationSender>();
        telegramMock.Setup(s => s.ChannelName).Returns("telegram");

        var evaluator = new AlertRuleEvaluator(db);
        var dispatcher = new NotificationDispatcher(
            evaluator,
            new[] { telegramMock.Object },
            NullLogger<NotificationDispatcher>.Instance);

        var dataEntryId = Guid.NewGuid();
        var diff = NewItemDiff();
        using var payload = NewPayload();

        // Act
        await dispatcher.DispatchAsync(db, rule.SourceId, dataEntryId, diff, payload, CancellationToken.None);

        // Assert: sender not called, no log rows
        telegramMock.Verify(s => s.SendAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        var logs = await db.NotificationLogs.ToListAsync();
        Assert.Empty(logs);
    }
}
