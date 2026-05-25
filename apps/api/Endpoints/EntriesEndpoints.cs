using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using WebCrawlerApi.Data;
using WebCrawlerApi.Models.Responses;

[assembly: InternalsVisibleTo("WebCrawlerApi.Tests")]

namespace WebCrawlerApi.Endpoints;

public static class EntriesEndpoints
{
    public static RouteGroupBuilder MapEntriesEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetEntries);
        return group;
    }

    internal static async Task<IResult> GetEntries(
        AppDbContext db,
        string? category = null,
        Guid? sourceId = null,
        DateTimeOffset? from = null,
        DateTimeOffset? to = null,
        string? q = null,
        string? cursor = null,
        int limit = 20)
    {
        limit = Math.Clamp(limit, 1, 100);

        var query = db.DataEntries
            .AsNoTracking()
            .OrderByDescending(e => e.CrawledAt)
            .ThenByDescending(e => e.Id)
            .AsQueryable();

        if (category is not null)
            query = query.Where(e => e.Category == category);
        if (sourceId.HasValue)
            query = query.Where(e => e.SourceId == sourceId.Value);
        if (from.HasValue)
            query = query.Where(e => e.CrawledAt >= from.Value);
        if (to.HasValue)
            query = query.Where(e => e.CrawledAt <= to.Value);

        // Phase 11: full-text search filter.
        // PlainToTsQuery (NOT ToTsQuery) — ignores and/or/not punctuation in user input,
        // safe against FTS operator injection. EF Core parameterizes q through Npgsql.
        // SearchVector is null for rows inserted before the AddFtsSearchVector migration;
        // those rows will not match any FTS query (acceptable per RESEARCH.md backfill note).
        if (!string.IsNullOrWhiteSpace(q))
            query = query.Where(e =>
                e.SearchVector != null &&
                e.SearchVector.Matches(EF.Functions.PlainToTsQuery("english", q)));

        if (cursor is not null)
        {
            try
            {
                var decoded = JsonSerializer.Deserialize<CursorToken>(
                    Convert.FromBase64String(cursor));
                if (decoded is not null)
                {
                    // Compound boolean OR expansion — EF Core workaround for tuple comparison
                    // (Pitfall 1: Id stored as string to avoid EF Core Guid.CompareTo translation failure)
                    query = query.Where(e =>
                        e.CrawledAt < decoded.At ||
                        (e.CrawledAt == decoded.At &&
                         string.Compare(e.Id.ToString(), decoded.Id) < 0));
                }
            }
            catch { /* invalid cursor — ignore, return first page */ }
        }

        var rows = await query.Take(limit + 1).ToListAsync();
        var hasNext = rows.Count > limit;
        if (hasNext) rows = rows.Take(limit).ToList();

        var nextCursor = hasNext
            ? Convert.ToBase64String(JsonSerializer.SerializeToUtf8Bytes(new CursorToken
              { At = rows.Last().CrawledAt, Id = rows.Last().Id.ToString() }))
            : null;

        // Pitfall 3: e.Payload.RootElement.Clone() detaches JsonElement from disposable JsonDocument lifetime
        var items = rows.Select(e => new DataEntryResponse(
            e.Id, e.SourceId, e.Category, e.EntryKey,
            e.Payload.RootElement.Clone(), e.CrawledAt)).ToList();

        return Results.Ok(new { items, nextCursor });
    }

    private record CursorToken
    {
        [JsonPropertyName("at")] public DateTimeOffset At { get; init; }
        [JsonPropertyName("id")] public string Id { get; init; } = string.Empty;
    }
}
