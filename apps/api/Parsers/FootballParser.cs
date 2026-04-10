namespace WebCrawlerApi.Parsers;

/// <summary>
/// Stub implementation — full implementation created in plan 03-04.
/// </summary>
public class FootballParser(ILogger<FootballParser> logger) : IContentParser
{
    public Task<IReadOnlyList<ParsedEntry>> ParseAsync(
        string rawContent,
        string sourceId,
        CancellationToken ct = default)
    {
        logger.LogWarning("FootballParser stub called — awaiting full implementation in 03-04");
        return Task.FromResult<IReadOnlyList<ParsedEntry>>([]);
    }
}
