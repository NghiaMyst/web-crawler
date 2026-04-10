namespace WebCrawlerApi.Parsers;

using System.Text.Json;

/// <summary>
/// Parses MangaDex REST API chapter response from MangaDexWorker.
/// Raw content shape: { data: [{ id, type, attributes: { chapter, title, volume, translatedLanguage, publishAt } }], total }
/// Note: MangaDexWorker does not include includes[]=manga — relationship manga titles are not available.
/// Entry key format: chapter_{id}
/// Category: manga
/// </summary>
public class MangaDexParser(ILogger<MangaDexParser> logger) : IContentParser
{
    public Task<IReadOnlyList<ParsedEntry>> ParseAsync(
        string rawContent,
        string sourceId,
        CancellationToken ct = default)
    {
        var results = new List<ParsedEntry>();

        try
        {
            using var doc = JsonDocument.Parse(rawContent);
            var root = doc.RootElement;

            if (!root.TryGetProperty("data", out var dataArr) ||
                dataArr.ValueKind != JsonValueKind.Array)
            {
                logger.LogWarning(
                    "MangaDexParser: no 'data' array found in response. SourceId={SourceId}",
                    sourceId);
                return Task.FromResult<IReadOnlyList<ParsedEntry>>(results);
            }

            foreach (var chapter in dataArr.EnumerateArray())
            {
                if (!chapter.TryGetProperty("id", out var idEl) ||
                    idEl.ValueKind != JsonValueKind.String)
                {
                    logger.LogWarning(
                        "MangaDexParser: chapter entry missing 'id', skipping. SourceId={SourceId}",
                        sourceId);
                    continue;
                }

                var chapterId = idEl.GetString();
                if (string.IsNullOrEmpty(chapterId))
                {
                    logger.LogWarning(
                        "MangaDexParser: chapter 'id' is empty, skipping. SourceId={SourceId}",
                        sourceId);
                    continue;
                }

                var entryKey = $"chapter_{chapterId}";

                string? chapterNum = null;
                string? title = null;
                string? volume = null;
                string? publishAt = null;
                string? language = null;

                if (chapter.TryGetProperty("attributes", out var attrs) &&
                    attrs.ValueKind == JsonValueKind.Object)
                {
                    if (attrs.TryGetProperty("chapter", out var cn) && cn.ValueKind == JsonValueKind.String)
                        chapterNum = cn.GetString();

                    if (attrs.TryGetProperty("title", out var t) && t.ValueKind == JsonValueKind.String)
                        title = t.GetString();

                    if (attrs.TryGetProperty("volume", out var v) && v.ValueKind == JsonValueKind.String)
                        volume = v.GetString();

                    if (attrs.TryGetProperty("publishAt", out var pa) && pa.ValueKind == JsonValueKind.String)
                        publishAt = pa.GetString();

                    if (attrs.TryGetProperty("translatedLanguage", out var lang) && lang.ValueKind == JsonValueKind.String)
                        language = lang.GetString();
                }

                // Extract manga title from relationships if present.
                // MangaDexWorker Phase 2 does not request includes[]=manga, so this will typically be null.
                string? mangaTitle = null;
                if (chapter.TryGetProperty("relationships", out var rels) &&
                    rels.ValueKind == JsonValueKind.Array)
                {
                    foreach (var rel in rels.EnumerateArray())
                    {
                        if (rel.TryGetProperty("type", out var relType) &&
                            relType.ValueKind == JsonValueKind.String &&
                            relType.GetString() == "manga" &&
                            rel.TryGetProperty("attributes", out var relAttrs) &&
                            relAttrs.ValueKind == JsonValueKind.Object &&
                            relAttrs.TryGetProperty("title", out var relTitle) &&
                            relTitle.ValueKind == JsonValueKind.Object)
                        {
                            mangaTitle = relTitle.TryGetProperty("en", out var en) && en.ValueKind == JsonValueKind.String
                                ? en.GetString()
                                : relTitle.TryGetProperty("ja", out var ja) && ja.ValueKind == JsonValueKind.String
                                    ? ja.GetString()
                                    : null;
                            break;
                        }
                    }
                }

                var payload = new
                {
                    manga_title = mangaTitle,
                    chapter = chapterNum,
                    title,
                    volume,
                    language,
                    publish_date = publishAt
                };

                results.Add(new ParsedEntry(sourceId, entryKey, "manga", payload));
            }

            logger.LogInformation(
                "MangaDexParser: produced {Count} entries. SourceId={SourceId}",
                results.Count,
                sourceId);
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "MangaDexParser: JSON parse failed. SourceId={SourceId}", sourceId);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "MangaDexParser: unexpected error. SourceId={SourceId}", sourceId);
        }

        return Task.FromResult<IReadOnlyList<ParsedEntry>>(results);
    }
}
