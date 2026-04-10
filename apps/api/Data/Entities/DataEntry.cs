using System.Text.Json;

namespace WebCrawlerApi.Data.Entities;

public class DataEntry
{
    public Guid Id { get; set; }
    public Guid SourceId { get; set; }
    public Guid? JobId { get; set; }
    public string Category { get; set; } = string.Empty;
    public string? EntryKey { get; set; }

    /// <summary>
    /// Structured parsed data stored as JSONB. Schema varies per domain.
    /// Mapped to PostgreSQL JSONB type with GIN index for fast payload queries.
    /// </summary>
    public JsonDocument Payload { get; set; } = JsonDocument.Parse("{}");

    public DateTimeOffset CrawledAt { get; set; }

    // Navigation properties
    public Source Source { get; set; } = null!;
    public CrawlJob? Job { get; set; }
}
