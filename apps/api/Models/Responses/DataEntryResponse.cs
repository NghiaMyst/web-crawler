using System.Text.Json;

namespace WebCrawlerApi.Models.Responses;

public record DataEntryResponse(
    Guid Id,
    Guid SourceId,
    string Category,
    string? EntryKey,
    JsonElement Payload,
    DateTimeOffset CrawledAt
);
