using System.Text.Json;

namespace WebCrawlerApi.Models.Notifications;

/// <summary>
/// Result of comparing old vs new JSONB payloads for a data entry.
/// </summary>
public record DiffResult(
    bool IsNewEntry,
    IReadOnlyDictionary<string, FieldChange> ChangedFields);

/// <summary>
/// A single field that changed between old and new payloads.
/// OldValue is null when the entry is new or the field was added.
/// </summary>
public record FieldChange(
    JsonElement? OldValue,
    JsonElement NewValue);
