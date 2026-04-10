namespace WebCrawlerApi.Parsers;

/// <summary>
/// Stub implementation — full implementation created in plan 03-05.
/// </summary>
public class MangaDexParser(ILogger<MangaDexParser> logger) : IContentParser
{
    public Task<IReadOnlyList<ParsedEntry>> ParseAsync(
        string rawContent,
        string sourceId,
        CancellationToken ct = default)
    {
        logger.LogWarning("MangaDexParser stub called — awaiting full implementation in 03-05");
        return Task.FromResult<IReadOnlyList<ParsedEntry>>([]);
    }
}
