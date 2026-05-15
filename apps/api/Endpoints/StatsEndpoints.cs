using Microsoft.EntityFrameworkCore;
using WebCrawlerApi.Data;

namespace WebCrawlerApi.Endpoints;

public static class StatsEndpoints
{
    public static RouteGroupBuilder MapStatsEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/volume", GetVolume);
        return group;
    }

    internal static async Task<IResult> GetVolume(
        AppDbContext db,
        string groupBy = "day",
        string range = "7d")
    {
        int rangeDays = range switch
        {
            "30d" => 30,
            "90d" => 90,
            _     => 7,
        };

        var cutoff = DateTimeOffset.UtcNow.AddDays(-rangeDays);

        var rows = await db.DataEntries
            .AsNoTracking()
            .Include(e => e.Source)
            .Where(e => e.CrawledAt >= cutoff)
            .GroupBy(e => new
            {
                e.SourceId,
                e.Source.DisplayName,
                Date = e.CrawledAt.Date,
            })
            .Select(g => new
            {
                sourceId   = g.Key.SourceId,
                sourceName = g.Key.DisplayName,
                date       = g.Key.Date.ToString("yyyy-MM-dd"),
                count      = g.Count(),
            })
            .OrderBy(r => r.date)
            .ThenBy(r => r.sourceName)
            .ToListAsync();

        return Results.Ok(rows);
    }
}
