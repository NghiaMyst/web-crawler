namespace WebCrawlerApi.Services;

/// <summary>
/// Common interface for notification delivery channels (Telegram, Discord).
/// </summary>
public interface INotificationSender
{
    /// <summary>
    /// Send a notification message. Returns true on success, false on failure.
    /// Must never throw -- failures are logged and returned as false.
    /// </summary>
    Task<bool> SendAsync(string message, CancellationToken ct);

    /// <summary>
    /// Channel name for logging ("telegram" or "discord").
    /// </summary>
    string ChannelName { get; }
}
