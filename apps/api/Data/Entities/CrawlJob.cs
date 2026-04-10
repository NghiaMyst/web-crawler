namespace WebCrawlerApi.Data.Entities;

public class CrawlJob
{
    public Guid Id { get; set; }
    public Guid SourceId { get; set; }
    public string Url { get; set; } = string.Empty;
    public string Status { get; set; } = "pending";
    public int Priority { get; set; } = 5;
    public string? ContentHash { get; set; }
    public int AttemptCount { get; set; } = 0;
    public string? ErrorMessage { get; set; }
    public DateTimeOffset ScheduledAt { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    // Navigation properties
    public Source Source { get; set; } = null!;
}
