using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WebCrawlerApi.Data;
using WebCrawlerApi.Data.Entities;
using WebCrawlerApi.Models.Notifications;

namespace WebCrawlerApi.Services;

public class AlertRuleEvaluator(AppDbContext db)
{
    /// <summary>
    /// Query active rules for source and evaluate against diff.
    /// </summary>
    public async Task<IReadOnlyList<AlertMatch>> EvaluateForSourceAsync(
        Guid sourceId,
        DiffResult diff,
        JsonDocument newPayload,
        CancellationToken ct)
    {
        var rules = await db.AlertRules
            .Where(r => r.SourceId == sourceId && r.IsActive)
            .ToListAsync(ct);

        return Evaluate(rules, diff, newPayload);
    }

    /// <summary>
    /// Pure evaluation logic -- testable without DB.
    /// </summary>
    public static IReadOnlyList<AlertMatch> Evaluate(
        IReadOnlyList<AlertRule> rules,
        DiffResult diff,
        JsonDocument newPayload)
    {
        var matches = new List<AlertMatch>();

        foreach (var rule in rules)
        {
            if (!rule.Condition.RootElement.TryGetProperty("type", out var typeEl))
                continue;

            var condType = typeEl.GetString();
            bool fired = condType switch
            {
                "new_item" => diff.IsNewEntry,
                "field_changed" => EvalFieldChanged(rule, diff),
                "threshold" => EvalThreshold(rule, newPayload),
                _ => false
            };

            if (fired)
                matches.Add(new AlertMatch(rule, diff, newPayload, condType!));
        }

        return matches;
    }

    private static bool EvalFieldChanged(AlertRule rule, DiffResult diff)
    {
        // Always use TryGetProperty for optional condition fields (threat T-04-03)
        if (!rule.Condition.RootElement.TryGetProperty("field", out var fieldEl))
            return false;

        var field = fieldEl.GetString();
        return field is not null && diff.ChangedFields.ContainsKey(field);
    }

    private static bool EvalThreshold(AlertRule rule, JsonDocument newPayload)
    {
        if (!rule.Condition.RootElement.TryGetProperty("field", out var fieldEl))
            return false;
        if (!rule.Condition.RootElement.TryGetProperty("operator", out var opEl))
            return false;
        if (!rule.Condition.RootElement.TryGetProperty("value", out var thresholdEl))
            return false;

        var field = fieldEl.GetString();
        if (field is null) return false;

        if (!newPayload.RootElement.TryGetProperty(field, out var actualEl))
            return false;

        // Use TryGetDouble for non-numeric field safety (threat T-04-05)
        if (!actualEl.TryGetDouble(out var actual)) return false;
        if (!thresholdEl.TryGetDouble(out var threshold)) return false;

        var op = opEl.GetString();
        return op switch
        {
            ">" => actual > threshold,
            ">=" => actual >= threshold,
            "<" => actual < threshold,
            "<=" => actual <= threshold,
            _ => false
        };
    }
}
