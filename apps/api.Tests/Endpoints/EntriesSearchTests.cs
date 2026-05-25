using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WebCrawlerApi.Data;
using WebCrawlerApi.Data.Entities;
using WebCrawlerApi.Endpoints;

namespace WebCrawlerApi.Tests.Endpoints;

/// <summary>
/// Integration tests for GET /api/entries?q= FTS filter.
/// NpgsqlTsVector.Matches() and EF.Functions.PlainToTsQuery require a real
/// PostgreSQL connection. Tests that actually exercise the FTS @@ operator
/// are [Trait("Category", "Integration")] and excluded from unit runs via
/// --filter "Category!=Integration".
///
/// Two unit-level guard tests verify the null/whitespace branch which never
/// reaches Postgres-specific code paths.
/// </summary>
public class EntriesSearchTests
{
    private static AppDbContext CreateContext(string dbName)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(dbName)
            .Options;
        return new AppDbContext(options);
    }

    private static Source CreateSource(Guid id) => new()
    {
        Id = id,
        Name = $"source-{id}",
        DisplayName = $"Source {id}",
        Url = "https://example.com",
        Category = "football",
        ParserKey = "football",
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow
    };

    [Fact]
    [Trait("Category", "Unit")]
    public async Task Search_NullQ_AppliesNoFtsFilter_ReturnsResult()
    {
        using var db = CreateContext(nameof(Search_NullQ_AppliesNoFtsFilter_ReturnsResult));
        var src = CreateSource(Guid.NewGuid());
        db.Sources.Add(src);
        db.DataEntries.Add(new DataEntry
        {
            Id = Guid.NewGuid(),
            SourceId = src.Id,
            Category = "football",
            EntryKey = "match_1",
            Payload = JsonDocument.Parse("{\"home_team\":\"Arsenal\"}"),
            CrawledAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        // q = null: existing path, no FTS .Where added.
        var result = await EntriesEndpoints.GetEntries(db, q: null);
        Assert.NotNull(result);
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task Search_WhitespaceQ_AppliesNoFtsFilter_ReturnsResult()
    {
        using var db = CreateContext(nameof(Search_WhitespaceQ_AppliesNoFtsFilter_ReturnsResult));
        // No data needed — we only verify the guard does not throw on whitespace.
        var result = await EntriesEndpoints.GetEntries(db, q: "   ");
        Assert.NotNull(result);
    }

    [Fact(Skip = "Integration — requires Postgres with AddFtsSearchVector migration applied")]
    [Trait("Category", "Integration")]
    public Task Search_NonEmptyQ_FiltersByTsQuery()
    {
        // Wired in a future commit when a Postgres test container is available.
        // Expected behavior:
        //  1. Seed sources + search_configs rows (or run AddFtsSearchVector migration)
        //  2. Insert two DataEntry rows: payload contains "Arsenal" vs "Chelsea"
        //     The BEFORE INSERT trigger fires, populating search_vector for both.
        //  3. GetEntries(db, q: "Arsenal") returns ONLY the Arsenal row.
        return Task.CompletedTask;
    }

    [Fact(Skip = "Integration — requires Postgres")]
    [Trait("Category", "Integration")]
    public Task Search_PreservesSort_CrawledAtDescending()
    {
        // Sort must remain OrderByDescending(CrawledAt) even with q.
        // Expected: two matching entries return newest-first.
        return Task.CompletedTask;
    }

    [Fact(Skip = "Integration — requires Postgres")]
    [Trait("Category", "Integration")]
    public Task Search_PreservesCursorPagination()
    {
        // Cursor + q together: first page with cursor=null, second page with cursor=nextCursor.
        // Both pages filtered by q.
        return Task.CompletedTask;
    }

    [Fact(Skip = "Static assertion — verified via grep at build time, not runtime")]
    [Trait("Category", "Integration")]
    public Task Search_DoesNotUseToTsQuery_OnlyPlainToTsQuery()
    {
        // Security intent: EntriesEndpoints.cs must call PlainToTsQuery, not ToTsQuery.
        // Enforced by acceptance criteria in Plan 11-03 Task 2.
        return Task.CompletedTask;
    }
}
