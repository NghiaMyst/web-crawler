using System.Text.Json;
using WebCrawlerApi.Models.Notifications;

namespace WebCrawlerApi.Services;

/// <summary>
/// Builds notification messages from AlertRule.MessageTpl using payload field substitution.
/// Per D-03: simple string.Replace per {token}, no templating engine.
/// Auto-appends change context for field_changed and threshold conditions.
/// </summary>
public static class MessageBuilder
{
    /// <summary>
    /// Returns the formatted message, or null if the result would be empty.
    /// </summary>
    public static string? BuildMessage(AlertMatch match)
    {
        var msg = match.Rule.MessageTpl;

        // Fallback: auto-generate message when template is empty or whitespace
        if (string.IsNullOrWhiteSpace(msg))
        {
            msg = match.ConditionType switch
            {
                "new_item" => $"[{match.Rule.Name}] New item detected",
                "field_changed" when match.Rule.Condition.RootElement.TryGetProperty("field", out var f)
                    => $"[{match.Rule.Name}] Field '{f.GetString()}' changed",
                "threshold" when match.Rule.Condition.RootElement.TryGetProperty("field", out var tf)
                    => $"[{match.Rule.Name}] Threshold breached on '{tf.GetString()}'",
                _ => $"[{match.Rule.Name}] Alert fired"
            };
        }

        // Step 1: {token} substitution from new payload (threat T-04-04: string.Replace only, no eval)
        foreach (var prop in match.NewPayload.RootElement.EnumerateObject())
        {
            msg = msg.Replace($"{{{prop.Name}}}", prop.Value.ToString());
        }

        // Step 2: auto-append per condition type (D-03)
        if (match.ConditionType == "field_changed")
        {
            if (match.Rule.Condition.RootElement.TryGetProperty("field", out var fieldEl))
            {
                var field = fieldEl.GetString()!;
                if (match.Diff.ChangedFields.TryGetValue(field, out var change))
                {
                    var oldStr = change.OldValue?.ToString() ?? "null";
                    var newStr = change.NewValue.ToString();
                    msg += $"\n{field}: {oldStr} -> {newStr}";
                }
            }
        }
        else if (match.ConditionType == "threshold")
        {
            if (match.Rule.Condition.RootElement.TryGetProperty("field", out var fieldEl))
            {
                var field = fieldEl.GetString()!;
                if (match.NewPayload.RootElement.TryGetProperty(field, out var valEl)
                    && valEl.TryGetDouble(out var val))
                {
                    msg += $"\nCurrent value: {val}";
                }
            }
        }

        // Validation: empty message guard (Pitfall 3)
        return string.IsNullOrWhiteSpace(msg) ? null : msg;
    }
}
