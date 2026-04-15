using System.Text.Json;
using WebCrawlerApi.Models.Notifications;

namespace WebCrawlerApi.Services;

/// <summary>
/// Compares old and new JSONB payloads to produce a structured diff.
/// Used by AlertRuleEvaluator to determine which alert conditions fire.
/// </summary>
public static class DiffEngine
{
    /// <summary>
    /// Compare two JsonDocument payloads field by field.
    /// If oldDoc is null, all fields in newDoc are treated as new (IsNewEntry = true).
    /// Comparison uses JsonElement.ToString() for value equality (raw JSON string comparison).
    /// </summary>
    public static DiffResult Compare(JsonDocument? oldDoc, JsonDocument newDoc)
    {
        var isNew = oldDoc is null;
        var changes = new Dictionary<string, FieldChange>();

        foreach (var prop in newDoc.RootElement.EnumerateObject())
        {
            if (isNew)
            {
                // Clone to detach from the document's pooled buffer
                changes[prop.Name] = new FieldChange(null, prop.Value.Clone());
                continue;
            }

            if (!oldDoc!.RootElement.TryGetProperty(prop.Name, out var oldVal))
            {
                // Field exists in new but not in old
                changes[prop.Name] = new FieldChange(null, prop.Value.Clone());
            }
            else if (oldVal.ToString() != prop.Value.ToString())
            {
                // Field value changed
                changes[prop.Name] = new FieldChange(oldVal.Clone(), prop.Value.Clone());
            }
        }

        return new DiffResult(isNew, changes);
    }
}
