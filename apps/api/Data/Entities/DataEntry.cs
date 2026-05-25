using System.Text.Json;
using NpgsqlTypes;

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

    /// <summary>
    /// PostgreSQL tsvector populated by data_entries_search_vector_trigger (Phase 11).
    /// NULL for rows inserted before the migration. Reads search_config.json_paths
    /// for this row's source_id, extracts JSONB values, and writes to_tsvector('english', ...).
    /// </summary>
    public NpgsqlTsVector? SearchVector { get; set; }

    // Navigation properties
    public Source Source { get; set; } = null!;
    public CrawlJob? Job { get; set; }
}
