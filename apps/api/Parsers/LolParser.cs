namespace WebCrawlerApi.Parsers;

using System.Text.Json;

/// <summary>
/// Parses u.gg LoL tier list data from __NEXT_DATA__ JSON extracted by LoLWorker.
/// Entry key format: champion_{name}_{role}
/// Category: game
/// </summary>
public class LolParser(ILogger<LolParser> logger) : IContentParser
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

            // Try to find champion data array from multiple possible structures:
            // 1. u.gg __NEXT_DATA__: { props: { pageProps: { data: [...] } } }
            // 2. u.gg __NEXT_DATA__: { props: { pageProps: { tierList: [...] } } }
            // 3. Flat array at root
            // 4. Direct { data: [...] } shape
            JsonElement champions;

            if (root.TryGetProperty("props", out var props) &&
                props.TryGetProperty("pageProps", out var pageProps))
            {
                if (pageProps.TryGetProperty("data", out champions) && champions.ValueKind == JsonValueKind.Array)
                {
                    // Standard __NEXT_DATA__ data array
                }
                else if (pageProps.TryGetProperty("tierList", out champions) && champions.ValueKind == JsonValueKind.Array)
                {
                    // Alternative __NEXT_DATA__ tierList array
                }
                else if (pageProps.TryGetProperty("championData", out champions) && champions.ValueKind == JsonValueKind.Array)
                {
                    // Another possible key
                }
                else
                {
                    logger.LogWarning(
                        "LolParser: no champion data array found in pageProps. SourceId={SourceId}",
                        sourceId);
                    return Task.FromResult<IReadOnlyList<ParsedEntry>>(results);
                }
            }
            else if (root.ValueKind == JsonValueKind.Array)
            {
                champions = root;
            }
            else if (root.TryGetProperty("data", out champions) && champions.ValueKind == JsonValueKind.Array)
            {
                // Direct { data: [...] } shape
            }
            else
            {
                logger.LogWarning(
                    "LolParser: unrecognized JSON structure. SourceId={SourceId}",
                    sourceId);
                return Task.FromResult<IReadOnlyList<ParsedEntry>>(results);
            }

            foreach (var champ in champions.EnumerateArray())
            {
                // Champion name — try multiple field names
                var name = champ.TryGetProperty("championName", out var cn) && cn.ValueKind == JsonValueKind.String
                    ? cn.GetString()
                    : champ.TryGetProperty("champion", out var c) && c.ValueKind == JsonValueKind.String
                        ? c.GetString()
                        : champ.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String
                            ? n.GetString()
                            : null;

                if (name == null)
                {
                    logger.LogWarning(
                        "LolParser: champion entry missing name, skipping. SourceId={SourceId}",
                        sourceId);
                    continue;
                }

                // Role — try multiple field names; default to "unknown"
                var role = champ.TryGetProperty("role", out var r) && r.ValueKind == JsonValueKind.String
                    ? r.GetString()
                    : champ.TryGetProperty("position", out var p) && p.ValueKind == JsonValueKind.String
                        ? p.GetString()
                        : "unknown";

                var entryKey = $"champion_{name.ToLowerInvariant()}_{role?.ToLowerInvariant() ?? "unknown"}";

                var tier = champ.TryGetProperty("tier", out var t) && t.ValueKind == JsonValueKind.String
                    ? t.GetString()
                    : null;

                double? winRate = null;
                if (champ.TryGetProperty("winRate", out var wr) && wr.ValueKind == JsonValueKind.Number)
                    winRate = wr.GetDouble();
                else if (champ.TryGetProperty("win_rate", out var wr2) && wr2.ValueKind == JsonValueKind.Number)
                    winRate = wr2.GetDouble();

                double? pickRate = null;
                if (champ.TryGetProperty("pickRate", out var pr) && pr.ValueKind == JsonValueKind.Number)
                    pickRate = pr.GetDouble();
                else if (champ.TryGetProperty("pick_rate", out var pr2) && pr2.ValueKind == JsonValueKind.Number)
                    pickRate = pr2.GetDouble();

                var patch = champ.TryGetProperty("patch", out var pa) && pa.ValueKind == JsonValueKind.String
                    ? pa.GetString()
                    : null;

                var payload = new
                {
                    champion = name,
                    role,
                    tier,
                    win_rate = winRate,
                    pick_rate = pickRate,
                    patch
                };

                results.Add(new ParsedEntry(sourceId, entryKey, "game", payload));
            }

            logger.LogInformation(
                "LolParser: produced {Count} entries. SourceId={SourceId}",
                results.Count,
                sourceId);
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "LolParser: JSON parse failed. SourceId={SourceId}", sourceId);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "LolParser: unexpected error. SourceId={SourceId}", sourceId);
        }

        return Task.FromResult<IReadOnlyList<ParsedEntry>>(results);
    }
}
