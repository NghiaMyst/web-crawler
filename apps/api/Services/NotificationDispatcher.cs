using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WebCrawlerApi.Data;
using WebCrawlerApi.Data.Entities;
using WebCrawlerApi.Models.Notifications;

namespace WebCrawlerApi.Services;

/// <summary>
/// Orchestrates the notification pipeline: evaluate rules -> build message -> send -> log.
/// Called inline from CrawlerEventListener after each upsert (D-01).
/// </summary>
public class NotificationDispatcher(
    AlertRuleEvaluator evaluator,
    IEnumerable<INotificationSender> senders,
    ILogger<NotificationDispatcher> logger)
{
    private const int MaxRetries = 2; // up to 2 additional attempts after first failure

    public async Task DispatchAsync(
        AppDbContext db,
        Guid sourceId,
        Guid dataEntryId,
        DiffResult diff,
        JsonDocument newPayload,
        CancellationToken ct)
    {
        var matches = await evaluator.EvaluateForSourceAsync(sourceId, diff, newPayload, ct);

        if (matches.Count == 0)
        {
            logger.LogDebug("No alert rules matched for source {SourceId}", sourceId);
            return;
        }

        logger.LogInformation("{Count} alert rule(s) matched for source {SourceId}",
            matches.Count, sourceId);

        foreach (var match in matches)
        {
            var message = MessageBuilder.BuildMessage(match);
            if (message is null)
            {
                logger.LogWarning("Empty message for rule {RuleId} — skipping", match.Rule.Id);
                continue;
            }

            // Dedup guard: check notification_logs for recent sent log (Pattern 8)
            var cutoff = DateTimeOffset.UtcNow.AddMinutes(-5);
            var alreadySent = await db.NotificationLogs.AnyAsync(n =>
                n.AlertRuleId == match.Rule.Id &&
                n.DataEntryId == dataEntryId &&
                n.Status == "sent" &&
                n.SentAt > cutoff, ct);

            if (alreadySent)
            {
                logger.LogDebug("Dedup: notification already sent for rule {RuleId}, entry {EntryId}",
                    match.Rule.Id, dataEntryId);
                continue;
            }

            // Find the correct sender by channel name
            var sender = senders.FirstOrDefault(s =>
                s.ChannelName == match.Rule.Channel);

            if (sender is null)
            {
                logger.LogWarning("No sender registered for channel {Channel}", match.Rule.Channel);
                continue;
            }

            // Send with retry (up to MaxRetries additional attempts)
            var success = false;
            var attempts = 0;
            while (!success && attempts <= MaxRetries)
            {
                attempts++;
                success = await sender.SendAsync(message, ct);
                if (!success && attempts <= MaxRetries)
                {
                    logger.LogWarning("Delivery attempt {Attempt} failed for rule {RuleId}, retrying...",
                        attempts, match.Rule.Id);
                    await Task.Delay(1000 * attempts, ct); // simple backoff: 1s, 2s
                }
            }

            // Log every final attempt outcome (NOTIF-07)
            await db.NotificationLogs.AddAsync(new NotificationLog
            {
                Id = Guid.NewGuid(),
                AlertRuleId = match.Rule.Id,
                DataEntryId = dataEntryId,
                Channel = match.Rule.Channel,
                Message = message,
                Status = success ? "sent" : "failed",
                SentAt = DateTimeOffset.UtcNow
            }, ct);
            await db.SaveChangesAsync(ct);

            logger.LogInformation(
                "Notification {Status} for rule {RuleId} via {Channel} (attempts: {Attempts})",
                success ? "sent" : "failed", match.Rule.Id, match.Rule.Channel, attempts);
        }
    }
}
