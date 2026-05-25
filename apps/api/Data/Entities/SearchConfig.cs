namespace WebCrawlerApi.Data.Entities;

/// <summary>
/// Per-source FTS field configuration. Maps a source_id to the JSONPath expressions
/// that should be extracted from data_entries.payload and concatenated into the
/// search_vector tsvector for that source. Read by the data_entries_search_vector_trigger
/// PL/pgSQL trigger function on INSERT/UPDATE.
/// </summary>
public class SearchConfig
{
    /// <summary>FK to sources.id. Primary key — one config row per source.</summary>
    public Guid SourceId { get; set; }

    /// <summary>
    /// PostgreSQL TEXT[] of JSONPath expressions, e.g. {"$.home_team", "$.away_team"}.
    /// Used by data_entries_search_vector_update() trigger function via
    /// jsonb_path_query(NEW.payload, path::jsonpath).
    /// </summary>
    public string[] JsonPaths { get; set; } = Array.Empty<string>();

    // Navigation
    public Source Source { get; set; } = null!;
}
