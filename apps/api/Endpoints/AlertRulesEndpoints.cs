using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WebCrawlerApi.Data;
using WebCrawlerApi.Data.Entities;

namespace WebCrawlerApi.Endpoints;

public static class AlertRulesEndpoints
{
    public static RouteGroupBuilder MapAlertRulesEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetAlertRules);
        group.MapPost("/", CreateAlertRule);
        group.MapPut("/{id:guid}", UpdateAlertRule);
        group.MapDelete("/{id:guid}", DeleteAlertRule);
        return group;
    }

    internal static async Task<IResult> UpdateAlertRule(
        Guid id, UpdateAlertRuleRequest req, AppDbContext db)
    {
        var rule = await db.AlertRules.FindAsync(id);
        if (rule is null) return Results.NotFound();

        if (req.Name is not null) rule.Name = req.Name;
        if (req.Channel is not null) rule.Channel = req.Channel;
        if (req.MessageTpl is not null) rule.MessageTpl = req.MessageTpl;
        if (req.IsActive.HasValue) rule.IsActive = req.IsActive.Value;
        if (req.Condition.HasValue)
            rule.Condition = JsonDocument.Parse(req.Condition.Value.GetRawText());
        // SourceId is immutable — intentionally not copied from req

        await db.SaveChangesAsync();
        return Results.Ok(rule);
    }

    internal static async Task<IResult> GetAlertRules(AppDbContext db)
    {
        var rules = await db.AlertRules.AsNoTracking().ToListAsync();
        return Results.Ok(rules);
    }

    internal static async Task<IResult> CreateAlertRule(
        CreateAlertRuleRequest req, AppDbContext db)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(req.Name)) errors["name"] = new[] { "Name is required" };
        if (req.SourceId == Guid.Empty) errors["sourceId"] = new[] { "SourceId is required" };
        if (string.IsNullOrWhiteSpace(req.Channel)) errors["channel"] = new[] { "Channel is required" };
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var rule = new AlertRule
        {
            SourceId = req.SourceId,
            Name = req.Name,
            Condition = req.Condition is not null
                ? JsonDocument.Parse(req.Condition.Value.GetRawText())
                : JsonDocument.Parse("{}"),
            MessageTpl = req.MessageTpl ?? string.Empty,
            Channel = req.Channel,
            IsActive = req.IsActive ?? true
        };

        db.AlertRules.Add(rule);
        await db.SaveChangesAsync();

        return Results.Created($"/api/alert-rules/{rule.Id}", rule);
    }

    internal static async Task<IResult> DeleteAlertRule(Guid id, AppDbContext db)
    {
        var rule = await db.AlertRules.FindAsync(id);
        if (rule is null) return Results.NotFound();

        db.AlertRules.Remove(rule);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}

public record CreateAlertRuleRequest(
    Guid SourceId,
    string Name,
    JsonElement? Condition,
    string? MessageTpl,
    string Channel,
    bool? IsActive = true
);

public record UpdateAlertRuleRequest(
    string? Name,
    string? Channel,
    string? MessageTpl,
    bool? IsActive,
    JsonElement? Condition
);
