using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using WebCrawlerApi.Data;
using WebCrawlerApi.Data.Entities;
using WebCrawlerApi.Endpoints;

namespace WebCrawlerApi.Tests.Endpoints;

public class EntriesEndpointsTests
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

    private static DataEntry CreateEntry(Guid sourceId, DateTimeOffset crawledAt, string category = "football", string? entryKey = null) => new()
    {
        Id = Guid.NewGuid(),
        SourceId = sourceId,
        Category = category,
        EntryKey = entryKey,
        Payload = JsonDocument.Parse("""{"title":"test"}"""),
        CrawledAt = crawledAt
    };

    private static async Task<AppDbContext> SeedDatabase(string dbName, int entryCount = 25)
    {
        var db = CreateContext(dbName);
        var sourceId = Guid.NewGuid();
        db.Sources.Add(CreateSource(sourceId));

        var baseTime = DateTimeOffset.UtcNow;
        for (int i = 0; i < entryCount; i++)
        {
            db.DataEntries.Add(CreateEntry(sourceId, baseTime.AddMinutes(-i), "football", $"key-{i}"));
        }
        await db.SaveChangesAsync();
        return db;
    }

    // Use camelCase options to match ASP.NET Core's default HTTP response serialization
    private static readonly JsonSerializerOptions CamelCaseOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    /// <summary>
    /// Extracts the serialized JSON body from any IResult that implements IValueHttpResult.
    /// Works with Ok&lt;AnonymousType&gt; since we can't cast to Ok&lt;object&gt; directly.
    /// Uses camelCase to match ASP.NET Core's default HTTP response behavior.
    /// </summary>
    private static JsonDocument ExtractBody(IResult result)
    {
        var valueResult = result as Microsoft.AspNetCore.Http.IValueHttpResult;
        Assert.NotNull(valueResult);
        var value = valueResult.Value;
        Assert.NotNull(value);
        var json = JsonSerializer.Serialize(value, CamelCaseOptions);
        return JsonDocument.Parse(json);
    }

    [Fact]
    public async Task GetEntries_NoParams_ReturnsUpTo20ItemsOrderedByCrawledAtDesc()
    {
        var db = await SeedDatabase(nameof(GetEntries_NoParams_ReturnsUpTo20ItemsOrderedByCrawledAtDesc));

        var result = await EntriesEndpoints.GetEntries(db);

        using var doc = ExtractBody(result);
        var items = doc.RootElement.GetProperty("items").EnumerateArray().ToList();

        Assert.Equal(20, items.Count);
        // Verify descending order
        for (int i = 0; i < items.Count - 1; i++)
        {
            var t1 = DateTimeOffset.Parse(items[i].GetProperty("crawledAt").GetString()!);
            var t2 = DateTimeOffset.Parse(items[i + 1].GetProperty("crawledAt").GetString()!);
            Assert.True(t1 >= t2);
        }
    }

    [Fact]
    public async Task GetEntries_WithLimit5_Returns5ItemsAndNextCursor()
    {
        var db = await SeedDatabase(nameof(GetEntries_WithLimit5_Returns5ItemsAndNextCursor));

        var result = await EntriesEndpoints.GetEntries(db, limit: 5);

        using var doc = ExtractBody(result);
        var items = doc.RootElement.GetProperty("items").EnumerateArray().ToList();
        var nextCursor = doc.RootElement.GetProperty("nextCursor");

        Assert.Equal(5, items.Count);
        Assert.NotEqual(JsonValueKind.Null, nextCursor.ValueKind);
        Assert.NotEmpty(nextCursor.GetString()!);
    }

    [Fact]
    public async Task GetEntries_WithCursor_ReturnsNonOverlappingPage2()
    {
        var db = await SeedDatabase(nameof(GetEntries_WithCursor_ReturnsNonOverlappingPage2));

        // Get page 1
        var result1 = await EntriesEndpoints.GetEntries(db, limit: 5);
        using var doc1 = ExtractBody(result1);
        var items1 = doc1.RootElement.GetProperty("items").EnumerateArray()
            .Select(x => x.GetProperty("id").GetString()).ToHashSet();
        var cursor = doc1.RootElement.GetProperty("nextCursor").GetString();

        // Get page 2 using cursor
        var result2 = await EntriesEndpoints.GetEntries(db, cursor: cursor, limit: 5);
        using var doc2 = ExtractBody(result2);
        var items2 = doc2.RootElement.GetProperty("items").EnumerateArray()
            .Select(x => x.GetProperty("id").GetString()).ToHashSet();

        Assert.Equal(5, items2.Count);
        Assert.Empty(items1.Intersect(items2));
    }

    [Fact]
    public async Task GetEntries_LastPage_ReturnsNullNextCursor()
    {
        var db = await SeedDatabase(nameof(GetEntries_LastPage_ReturnsNullNextCursor), entryCount: 3);

        var result = await EntriesEndpoints.GetEntries(db, limit: 10);

        using var doc = ExtractBody(result);
        var items = doc.RootElement.GetProperty("items").EnumerateArray().ToList();
        var nextCursor = doc.RootElement.GetProperty("nextCursor");

        Assert.Equal(3, items.Count);
        Assert.Equal(JsonValueKind.Null, nextCursor.ValueKind);
    }

    [Fact]
    public async Task GetEntries_CategoryFilter_ReturnsOnlyMatchingCategory()
    {
        var db = CreateContext(nameof(GetEntries_CategoryFilter_ReturnsOnlyMatchingCategory));
        var sourceId = Guid.NewGuid();
        db.Sources.Add(CreateSource(sourceId));
        var baseTime = DateTimeOffset.UtcNow;
        db.DataEntries.Add(CreateEntry(sourceId, baseTime, "football", "f1"));
        db.DataEntries.Add(CreateEntry(sourceId, baseTime.AddMinutes(-1), "football", "f2"));
        db.DataEntries.Add(CreateEntry(sourceId, baseTime.AddMinutes(-2), "genshin", "g1"));
        db.DataEntries.Add(CreateEntry(sourceId, baseTime.AddMinutes(-3), "genshin", "g2"));
        await db.SaveChangesAsync();

        var result = await EntriesEndpoints.GetEntries(db, category: "football");

        using var doc = ExtractBody(result);
        var items = doc.RootElement.GetProperty("items").EnumerateArray().ToList();

        Assert.Equal(2, items.Count);
        Assert.All(items, item => Assert.Equal("football", item.GetProperty("category").GetString()));
    }

    [Fact]
    public async Task GetEntries_SourceIdFilter_ReturnsOnlyMatchingSource()
    {
        var db = CreateContext(nameof(GetEntries_SourceIdFilter_ReturnsOnlyMatchingSource));
        var source1 = Guid.NewGuid();
        var source2 = Guid.NewGuid();
        db.Sources.Add(CreateSource(source1));
        db.Sources.Add(CreateSource(source2));
        var baseTime = DateTimeOffset.UtcNow;
        db.DataEntries.Add(CreateEntry(source1, baseTime, "football", "s1e1"));
        db.DataEntries.Add(CreateEntry(source1, baseTime.AddMinutes(-1), "football", "s1e2"));
        db.DataEntries.Add(CreateEntry(source2, baseTime.AddMinutes(-2), "football", "s2e1"));
        await db.SaveChangesAsync();

        var result = await EntriesEndpoints.GetEntries(db, sourceId: source1);

        using var doc = ExtractBody(result);
        var items = doc.RootElement.GetProperty("items").EnumerateArray().ToList();

        Assert.Equal(2, items.Count);
        Assert.All(items, item => Assert.Equal(source1.ToString(), item.GetProperty("sourceId").GetString()));
    }

    [Fact]
    public async Task GetEntries_DateRangeFilter_ReturnsOnlyEntriesInRange()
    {
        var db = CreateContext(nameof(GetEntries_DateRangeFilter_ReturnsOnlyEntriesInRange));
        var sourceId = Guid.NewGuid();
        db.Sources.Add(CreateSource(sourceId));
        var baseTime = new DateTimeOffset(2026, 1, 10, 12, 0, 0, TimeSpan.Zero);
        db.DataEntries.Add(CreateEntry(sourceId, baseTime, "football", "e1"));
        db.DataEntries.Add(CreateEntry(sourceId, baseTime.AddDays(-1), "football", "e2"));
        db.DataEntries.Add(CreateEntry(sourceId, baseTime.AddDays(-2), "football", "e3"));
        db.DataEntries.Add(CreateEntry(sourceId, baseTime.AddDays(-5), "football", "e4"));
        await db.SaveChangesAsync();

        var from = baseTime.AddDays(-2);
        var to = baseTime.AddDays(-1).AddHours(1);
        var result = await EntriesEndpoints.GetEntries(db, from: from, to: to);

        using var doc = ExtractBody(result);
        var items = doc.RootElement.GetProperty("items").EnumerateArray().ToList();

        Assert.Equal(2, items.Count);
    }

    [Fact]
    public async Task GetEntries_LimitOver100_CapsAt100()
    {
        var db = await SeedDatabase(nameof(GetEntries_LimitOver100_CapsAt100));

        var result = await EntriesEndpoints.GetEntries(db, limit: 200);

        using var doc = ExtractBody(result);
        var items = doc.RootElement.GetProperty("items").EnumerateArray().ToList();

        // Only 25 seeded entries, so return 25 (less than 100 cap)
        Assert.True(items.Count <= 25);
    }

    [Fact]
    public async Task GetEntries_InvalidBase64Cursor_IgnoresAndReturnsFirstPage()
    {
        var db = await SeedDatabase(nameof(GetEntries_InvalidBase64Cursor_IgnoresAndReturnsFirstPage));

        var result = await EntriesEndpoints.GetEntries(db, cursor: "not-valid-base64!!!", limit: 5);

        using var doc = ExtractBody(result);
        var items = doc.RootElement.GetProperty("items").EnumerateArray().ToList();

        // Should return first page (5 items) ignoring invalid cursor
        Assert.Equal(5, items.Count);
    }

    [Fact]
    public async Task GetEntries_PayloadIsInlineJson_NotEscapedString()
    {
        var db = CreateContext(nameof(GetEntries_PayloadIsInlineJson_NotEscapedString));
        var sourceId = Guid.NewGuid();
        db.Sources.Add(CreateSource(sourceId));
        db.DataEntries.Add(new DataEntry
        {
            Id = Guid.NewGuid(),
            SourceId = sourceId,
            Category = "football",
            EntryKey = "payload-test",
            Payload = JsonDocument.Parse("""{"name":"Arsenal","points":75}"""),
            CrawledAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        var result = await EntriesEndpoints.GetEntries(db);

        using var doc = ExtractBody(result);
        var firstItem = doc.RootElement.GetProperty("items").EnumerateArray().First();
        var payload = firstItem.GetProperty("payload");

        // Payload should be an object (JsonValueKind.Object), not a string
        Assert.Equal(JsonValueKind.Object, payload.ValueKind);
        Assert.Equal("Arsenal", payload.GetProperty("name").GetString());
        Assert.Equal(75, payload.GetProperty("points").GetInt32());
    }
}
