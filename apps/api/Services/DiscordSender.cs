using System.Net.Http.Json;

namespace WebCrawlerApi.Services;

/// <summary>
/// Sends notifications via Discord Webhook (plain content POST).
/// Credential from env var per D-04.
/// </summary>
public class DiscordSender(HttpClient httpClient, ILogger<DiscordSender> logger)
    : INotificationSender
{
    public string ChannelName => "discord";

    public async Task<bool> SendAsync(string message, CancellationToken ct)
    {
        var webhookUrl = Environment.GetEnvironmentVariable("DISCORD_WEBHOOK_URL");

        if (string.IsNullOrEmpty(webhookUrl))
        {
            logger.LogWarning("Discord webhook not configured (DISCORD_WEBHOOK_URL missing)");
            return false;
        }

        try
        {
            var body = new { content = message };
            var response = await httpClient.PostAsJsonAsync(webhookUrl, body, ct);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Discord webhook returned {StatusCode}", (int)response.StatusCode);
                return false;
            }

            logger.LogInformation("Discord message sent via webhook");
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Discord delivery failed");
            return false;
        }
    }
}
