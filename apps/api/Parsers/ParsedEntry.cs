namespace WebCrawlerApi.Parsers;

/// <summary>
/// Output of a parser. Payload will be serialized to JSONB via JsonSerializer.Serialize.
/// </summary>
public record ParsedEntry(
    string SourceId,
    string EntryKey,
    string Category,
    object Payload);
