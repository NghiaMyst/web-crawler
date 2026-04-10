namespace WebCrawlerApi.Data.Entities;

public class NotificationLog
{
    public Guid Id { get; set; }
    public Guid AlertRuleId { get; set; }
    public Guid? DataEntryId { get; set; }
    public string Channel { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Status { get; set; } = "sent";
    public DateTimeOffset SentAt { get; set; }

    // Navigation properties
    public AlertRule AlertRule { get; set; } = null!;
    public DataEntry? DataEntry { get; set; }
}
