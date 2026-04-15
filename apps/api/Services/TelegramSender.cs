using System.Net.Http.Json;

namespace WebCrawlerApi.Services;

/// <summary>
/// Sends notifications via Telegram Bot API (sendMessage endpoint).
/// Uses direct HttpClient per RESEARCH.md recommendation (no Telegram.Bot NuGet).
/// Credentials from env vars per D-04.
/// </summary>
public class TelegramSender(HttpClient httpClient, ILogger<TelegramSender> logger)
    : INotificationSender
{
    public string ChannelName => "telegram";

    public async Task<bool> SendAsync(string message, CancellationToken ct)
    {
        var token = Environment.GetEnvironmentVariable("TELEGRAM_BOT_TOKEN");
        var chatId = Environment.GetEnvironmentVariable("TELEGRAM_CHAT_ID");

        if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(chatId))
        {
            logger.LogWarning("Telegram credentials not configured (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing)");
            return false;
        }

        try
        {
            var url = $"https://api.telegram.org/bot{token}/sendMessage";
            var body = new { chat_id = chatId, text = message };
            var response = await httpClient.PostAsJsonAsync(url, body, ct);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Telegram API returned {StatusCode}", (int)response.StatusCode);
                return false;
            }

            logger.LogInformation("Telegram message sent to chat {ChatId}", chatId);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Telegram delivery failed");
            return false;
        }
    }
}
