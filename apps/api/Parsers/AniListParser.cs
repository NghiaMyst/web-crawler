namespace WebCrawlerApi.Parsers;

using System.Text.Json;

/// <summary>
/// Parses AniList GraphQL airing schedule response from AniListWorker.
/// Raw content shape: { data: { Page: { media: [{ id, title: { romaji, english }, nextAiringEpisode: { airingAt, episode } }] } } }
/// Entry key format: anime_{id}
/// Category: anime
/// </summary>
public class AniListParser(ILogger<AniListParser> logger) : IContentParser
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

            // Navigate AniList GraphQL response: { data: { Page: { media: [...] } } }
            // Also handle flat array or direct { media: [...] } for flexibility
            JsonElement mediaList;

            if (root.TryGetProperty("data", out var data))
            {
                if (data.TryGetProperty("Page", out var page) &&
                    page.TryGetProperty("media", out mediaList) &&
                    mediaList.ValueKind == JsonValueKind.Array)
                {
                    // Standard AniList GraphQL shape
                }
                else if (data.TryGetProperty("media", out mediaList) &&
                         mediaList.ValueKind == JsonValueKind.Array)
                {
                    // Alternative: data.media array
                }
                else
                {
                    logger.LogWarning(
                        "AniListParser: no media list found in GraphQL response. SourceId={SourceId}",
                        sourceId);
                    return Task.FromResult<IReadOnlyList<ParsedEntry>>(results);
                }
            }
            else if (root.ValueKind == JsonValueKind.Array)
            {
                mediaList = root;
            }
            else
            {
                logger.LogWarning(
                    "AniListParser: unrecognized JSON structure. SourceId={SourceId}",
                    sourceId);
                return Task.FromResult<IReadOnlyList<ParsedEntry>>(results);
            }

            foreach (var anime in mediaList.EnumerateArray())
            {
                if (!anime.TryGetProperty("id", out var idEl) || idEl.ValueKind == JsonValueKind.Null)
                {
                    logger.LogWarning(
                        "AniListParser: anime entry missing 'id', skipping. SourceId={SourceId}",
                        sourceId);
                    continue;
                }

                var animeId = idEl.GetInt32();
                var entryKey = $"anime_{animeId}";

                // Title: prefer English, fall back to romaji
                string? title = null;
                if (anime.TryGetProperty("title", out var titleObj) &&
                    titleObj.ValueKind == JsonValueKind.Object)
                {
                    title = titleObj.TryGetProperty("english", out var eng) && eng.ValueKind == JsonValueKind.String
                        ? eng.GetString()
                        : titleObj.TryGetProperty("romaji", out var rom) && rom.ValueKind == JsonValueKind.String
                            ? rom.GetString()
                            : null;
                }

                if (title == null)
                {
                    logger.LogWarning(
                        "AniListParser: anime {AnimeId} missing title, skipping. SourceId={SourceId}",
                        animeId,
                        sourceId);
                    continue;
                }

                int? episode = null;
                string? airDate = null;

                if (anime.TryGetProperty("nextAiringEpisode", out var nextEp) &&
                    nextEp.ValueKind == JsonValueKind.Object)
                {
                    if (nextEp.TryGetProperty("episode", out var epEl) &&
                        epEl.ValueKind == JsonValueKind.Number)
                    {
                        episode = epEl.GetInt32();
                    }

                    if (nextEp.TryGetProperty("airingAt", out var airingAt) &&
                        airingAt.ValueKind == JsonValueKind.Number)
                    {
                        airDate = DateTimeOffset.FromUnixTimeSeconds(airingAt.GetInt64())
                            .ToString("yyyy-MM-dd");
                    }
                }

                // status and averageScore: AniListWorker Phase 2 query does not fetch these fields.
                // Read them defensively — they will be null when not present in raw content.
                string? status = null;
                if (anime.TryGetProperty("status", out var st) && st.ValueKind == JsonValueKind.String)
                    status = st.GetString()?.ToLowerInvariant().Replace("_", " ");

                double? malScore = null;
                if (anime.TryGetProperty("averageScore", out var sc) && sc.ValueKind == JsonValueKind.Number)
                    malScore = sc.GetDouble() / 10.0; // AniList uses 0–100; SCHEMA.md shows 0–10

                var payload = new
                {
                    title,
                    episode,
                    air_date = airDate,
                    status,
                    mal_score = malScore
                };

                results.Add(new ParsedEntry(sourceId, entryKey, "anime", payload));
            }

            logger.LogInformation(
                "AniListParser: produced {Count} entries. SourceId={SourceId}",
                results.Count,
                sourceId);
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "AniListParser: JSON parse failed. SourceId={SourceId}", sourceId);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AniListParser: unexpected error. SourceId={SourceId}", sourceId);
        }

        return Task.FromResult<IReadOnlyList<ParsedEntry>>(results);
    }
}
