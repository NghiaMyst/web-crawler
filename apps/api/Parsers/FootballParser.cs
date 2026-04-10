namespace WebCrawlerApi.Parsers;

using System.Text.Json;

public class FootballParser(ILogger<FootballParser> logger) : IContentParser
{
    public Task<IReadOnlyList<ParsedEntry>> ParseAsync(
        string rawContent, string sourceId, CancellationToken ct = default)
    {
        var results = new List<ParsedEntry>();
        try
        {
            using var doc = JsonDocument.Parse(rawContent);
            var root = doc.RootElement;

            // Handle matches response (from /competitions/PL/matches endpoint)
            if (root.TryGetProperty("matches", out var matches))
            {
                foreach (var match in matches.EnumerateArray())
                {
                    if (!match.TryGetProperty("id", out var idEl))
                    {
                        logger.LogWarning("FootballParser: match missing 'id', skipping. SourceId={SourceId}", sourceId);
                        continue;
                    }

                    var entryKey = $"match_{idEl.GetInt32()}";
                    var homeTeam = match.TryGetProperty("homeTeam", out var ht)
                        ? ht.TryGetProperty("name", out var htn) ? htn.GetString() : null
                        : null;
                    var awayTeam = match.TryGetProperty("awayTeam", out var at)
                        ? at.TryGetProperty("name", out var atn) ? atn.GetString() : null
                        : null;

                    if (homeTeam == null || awayTeam == null)
                    {
                        logger.LogWarning("FootballParser: match {Id} missing team names, skipping. SourceId={SourceId}",
                            idEl.GetInt32(), sourceId);
                        continue;
                    }

                    int? homeScore = null, awayScore = null;
                    if (match.TryGetProperty("score", out var score) &&
                        score.TryGetProperty("fullTime", out var ft))
                    {
                        homeScore = ft.TryGetProperty("home", out var hs) && hs.ValueKind == JsonValueKind.Number
                            ? hs.GetInt32() : null;
                        awayScore = ft.TryGetProperty("away", out var aws) && aws.ValueKind == JsonValueKind.Number
                            ? aws.GetInt32() : null;
                    }

                    var matchDate = match.TryGetProperty("utcDate", out var ud)
                        ? ud.GetString() : null;
                    var status = match.TryGetProperty("status", out var st)
                        ? st.GetString() : null;

                    var payload = new
                    {
                        home_team = homeTeam,
                        away_team = awayTeam,
                        home_score = homeScore,
                        away_score = awayScore,
                        match_date = matchDate,
                        competition = "Premier League",
                        status
                    };

                    results.Add(new ParsedEntry(sourceId, entryKey, "football", payload));
                }
            }

            // Handle standings response (from /competitions/PL/standings endpoint)
            if (root.TryGetProperty("standings", out var standings))
            {
                foreach (var standingGroup in standings.EnumerateArray())
                {
                    if (!standingGroup.TryGetProperty("table", out var table)) continue;

                    foreach (var row in table.EnumerateArray())
                    {
                        var teamName = row.TryGetProperty("team", out var team)
                            ? team.TryGetProperty("name", out var tn) ? tn.GetString() : null
                            : null;

                        if (teamName == null)
                        {
                            logger.LogWarning("FootballParser: standings row missing team name, skipping. SourceId={SourceId}", sourceId);
                            continue;
                        }

                        var teamId = team.TryGetProperty("id", out var tid) ? tid.GetInt32() : 0;
                        var entryKey = $"standing_{teamId}";

                        var payload = new
                        {
                            team = teamName,
                            position = row.TryGetProperty("position", out var pos) ? pos.GetInt32() : 0,
                            points = row.TryGetProperty("points", out var pts) ? pts.GetInt32() : 0,
                            played = row.TryGetProperty("playedGames", out var pg) ? pg.GetInt32() : 0,
                            won = row.TryGetProperty("won", out var w) ? w.GetInt32() : 0,
                            draw = row.TryGetProperty("draw", out var d) ? d.GetInt32() : 0,
                            lost = row.TryGetProperty("lost", out var l) ? l.GetInt32() : 0,
                            goals_for = row.TryGetProperty("goalsFor", out var gf) ? gf.GetInt32() : 0,
                            goals_against = row.TryGetProperty("goalsAgainst", out var ga) ? ga.GetInt32() : 0,
                            goal_difference = row.TryGetProperty("goalDifference", out var gd) ? gd.GetInt32() : 0,
                            competition = "Premier League"
                        };

                        results.Add(new ParsedEntry(sourceId, entryKey, "football", payload));
                    }
                }
            }

            logger.LogInformation("FootballParser: produced {Count} entries. SourceId={SourceId}",
                results.Count, sourceId);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "FootballParser: parse failed. SourceId={SourceId}", sourceId);
        }

        return Task.FromResult<IReadOnlyList<ParsedEntry>>(results);
    }
}
