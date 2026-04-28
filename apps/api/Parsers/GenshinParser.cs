namespace WebCrawlerApi.Parsers;

using System.Text.Json;

public class GenshinParser(ILogger<GenshinParser> logger) : IContentParser
{
    public Task<IReadOnlyList<ParsedEntry>> ParseAsync(
        string rawContent, string sourceId, CancellationToken ct = default)
    {
        var results = new List<ParsedEntry>();
        try
        {
            using var doc = JsonDocument.Parse(rawContent);
            var root = doc.RootElement;

            // If root is a String the worker stored HTML from the cheerio fallback — nothing to parse
            if (root.ValueKind != JsonValueKind.Object && root.ValueKind != JsonValueKind.Array)
            {
                logger.LogWarning("GenshinParser: raw content is not JSON object/array (got {Kind}), skipping. SourceId={SourceId}",
                    root.ValueKind, sourceId);
                return Task.FromResult<IReadOnlyList<ParsedEntry>>(results);
            }

            // Navigate to the event list — HoYoWiki API / HoYoLab response structure
            // Try multiple known paths for robustness across different API endpoints
            JsonElement events;
            if (root.TryGetProperty("data", out var data) &&
                data.ValueKind == JsonValueKind.Object &&
                data.TryGetProperty("list", out events))
            {
                // HoYoWiki API structure: { data: { list: [...] } }
            }
            else if (root.TryGetProperty("list", out events))
            {
                // Flat list: { list: [...] }
            }
            else if (root.ValueKind == JsonValueKind.Array)
            {
                // Root is an array directly
                events = root;
            }
            else
            {
                logger.LogWarning("GenshinParser: no event list found in response. SourceId={SourceId}", sourceId);
                return Task.FromResult<IReadOnlyList<ParsedEntry>>(results);
            }

            foreach (var evt in events.EnumerateArray())
            {
                // Try multiple ID field names for robustness
                string? eventId = null;
                if (evt.TryGetProperty("id", out var idEl))
                    eventId = idEl.ToString();
                else if (evt.TryGetProperty("ann_id", out var annIdEl))
                    eventId = annIdEl.ToString();

                var eventName = evt.TryGetProperty("name", out var nameEl) ? nameEl.GetString()
                    : evt.TryGetProperty("title", out var titleEl) ? titleEl.GetString()
                    : evt.TryGetProperty("subtitle", out var subEl) ? subEl.GetString()
                    : null;

                if (eventId == null || eventName == null)
                {
                    logger.LogWarning("GenshinParser: event missing id or name, skipping. SourceId={SourceId}", sourceId);
                    continue;
                }

                var entryKey = $"event_{eventId}";

                var startDate = evt.TryGetProperty("start_time", out var st) ? st.GetString()
                    : evt.TryGetProperty("start_date", out var sd) ? sd.GetString()
                    : null;
                var endDate = evt.TryGetProperty("end_time", out var et) ? et.GetString()
                    : evt.TryGetProperty("end_date", out var ed) ? ed.GetString()
                    : null;

                // Extract rewards if present
                string[]? rewards = null;
                if (evt.TryGetProperty("rewards", out var rewardsEl) &&
                    rewardsEl.ValueKind == JsonValueKind.Array)
                {
                    rewards = rewardsEl.EnumerateArray()
                        .Select(r => r.GetString() ?? "")
                        .Where(r => r != "")
                        .ToArray();
                }

                var payload = new
                {
                    event_name = eventName,
                    start_date = startDate,
                    end_date = endDate,
                    rewards,
                    is_active = true  // if event is in the list, it's currently active
                };

                results.Add(new ParsedEntry(sourceId, entryKey, "game", payload));
            }

            logger.LogInformation("GenshinParser: produced {Count} entries. SourceId={SourceId}",
                results.Count, sourceId);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "GenshinParser: parse failed. SourceId={SourceId}", sourceId);
        }

        return Task.FromResult<IReadOnlyList<ParsedEntry>>(results);
    }
}
