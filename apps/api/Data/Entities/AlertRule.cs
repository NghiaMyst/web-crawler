using System.Text.Json;

namespace WebCrawlerApi.Data.Entities;

public class AlertRule
{
    public Guid Id { get; set; }
    public Guid SourceId { get; set; }
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Alert trigger condition stored as JSONB.
    /// Example: {"type":"new_item"} or {"type":"field_changed","field":"patch_version"}
    /// </summary>
    public JsonDocument Condition { get; set; } = JsonDocument.Parse("{}");

    public string MessageTpl { get; set; } = string.Empty;
    public string Channel { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }

    // Navigation properties
    public Source Source { get; set; } = null!;
    public ICollection<NotificationLog> NotificationLogs { get; set; } = new List<NotificationLog>();
}
