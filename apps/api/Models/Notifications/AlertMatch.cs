using System.Text.Json;
using WebCrawlerApi.Data.Entities;

namespace WebCrawlerApi.Models.Notifications;

/// <summary>
/// Pairs an AlertRule that fired with the diff context and new payload.
/// Used by NotificationDispatcher to build the message and route to the correct channel.
/// </summary>
public record AlertMatch(
    AlertRule Rule,
    DiffResult Diff,
    JsonDocument NewPayload,
    string ConditionType);
