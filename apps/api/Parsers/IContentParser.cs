namespace WebCrawlerApi.Parsers;

public interface IContentParser
{
    /// <summary>
    /// Parses raw crawl content into structured entries for storage.
    /// On missing/null fields: log WARN and skip entry (do not throw) — per D-05.
    /// </summary>
    Task<IReadOnlyList<ParsedEntry>> ParseAsync(
        string rawContent,
        string sourceId,
        CancellationToken ct = default);
}
