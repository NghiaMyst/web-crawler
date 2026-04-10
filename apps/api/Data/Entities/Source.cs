namespace WebCrawlerApi.Data.Entities;

public class Source
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string CrawlerType { get; set; } = "cheerio";
    public int CrawlInterval { get; set; } = 3600;
    public int Priority { get; set; } = 5;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset? LastCrawledAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>
    /// Identifies the keyed parser service to use for this source (e.g., "football", "genshin", "lol").
    /// Required for IContentParser keyed service dispatch.
    /// </summary>
    public string ParserKey { get; set; } = string.Empty;

    // Navigation properties
    public ICollection<CrawlJob> CrawlJobs { get; set; } = new List<CrawlJob>();
    public ICollection<DataEntry> DataEntries { get; set; } = new List<DataEntry>();
    public ICollection<AlertRule> AlertRules { get; set; } = new List<AlertRule>();
}
