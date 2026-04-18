using Microsoft.EntityFrameworkCore;
using WebCrawlerApi.Data;
using WebCrawlerApi.Data.Entities;

namespace WebCrawlerApi.Endpoints;

public static class SourcesEndpoints
{
    public static RouteGroupBuilder MapSourcesEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetAllSources);
        group.MapGet("/{id:guid}", GetSourceById);
        group.MapPost("/", CreateSource);
        group.MapPut("/{id:guid}", UpdateSource);
        group.MapDelete("/{id:guid}", DeleteSource);
        return group;
    }

    internal static async Task<IResult> GetAllSources(AppDbContext db)
    {
        var sources = await db.Sources.AsNoTracking().ToListAsync();
        return Results.Ok(sources);
    }

    internal static async Task<IResult> GetSourceById(Guid id, AppDbContext db)
    {
        var source = await db.Sources.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id);
        return source is null ? Results.NotFound() : Results.Ok(source);
    }

    internal static async Task<IResult> CreateSource(CreateSourceRequest req, AppDbContext db)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(req.Name)) errors["name"] = new[] { "Name is required" };
        if (string.IsNullOrWhiteSpace(req.Url)) errors["url"] = new[] { "URL is required" };
        if (string.IsNullOrWhiteSpace(req.ParserKey)) errors["parserKey"] = new[] { "ParserKey is required" };
        if (errors.Count > 0) return Results.ValidationProblem(errors);

        var source = new Source
        {
            Name = req.Name,
            DisplayName = req.DisplayName ?? req.Name,
            Url = req.Url,
            Category = req.Category ?? string.Empty,
            ParserKey = req.ParserKey,
            CrawlerType = req.CrawlerType ?? "cheerio",
            CrawlInterval = req.CrawlInterval ?? 3600,
            Priority = req.Priority ?? 5,
            IsActive = req.IsActive ?? true,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        db.Sources.Add(source);
        await db.SaveChangesAsync();

        return Results.Created($"/api/sources/{source.Id}", source);
    }

    internal static async Task<IResult> UpdateSource(Guid id, UpdateSourceRequest req, AppDbContext db)
    {
        var source = await db.Sources.FindAsync(id);
        if (source is null) return Results.NotFound();

        if (req.DisplayName is not null) source.DisplayName = req.DisplayName;
        if (req.Url is not null) source.Url = req.Url;
        if (req.CrawlInterval.HasValue) source.CrawlInterval = req.CrawlInterval.Value;
        if (req.Priority.HasValue) source.Priority = req.Priority.Value;
        if (req.IsActive.HasValue) source.IsActive = req.IsActive.Value;
        source.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        return Results.Ok(source);
    }

    internal static async Task<IResult> DeleteSource(Guid id, AppDbContext db)
    {
        var source = await db.Sources.FindAsync(id);
        if (source is null) return Results.NotFound();

        db.Sources.Remove(source);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}

public record CreateSourceRequest(
    string Name,
    string? DisplayName,
    string Url,
    string? Category,
    string ParserKey,
    string? CrawlerType = "cheerio",
    int? CrawlInterval = 3600,
    int? Priority = 5,
    bool? IsActive = true
);

public record UpdateSourceRequest(
    string? DisplayName,
    string? Url,
    int? CrawlInterval,
    int? Priority,
    bool? IsActive
);
