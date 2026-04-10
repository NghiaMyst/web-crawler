using Microsoft.EntityFrameworkCore;
using WebCrawlerApi.Data.Entities;

namespace WebCrawlerApi.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Source> Sources => Set<Source>();
    public DbSet<CrawlJob> CrawlJobs => Set<CrawlJob>();
    public DbSet<DataEntry> DataEntries => Set<DataEntry>();
    public DbSet<AlertRule> AlertRules => Set<AlertRule>();
    public DbSet<NotificationLog> NotificationLogs => Set<NotificationLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // snake_case naming convention is configured on DbContextOptionsBuilder in Program.cs
        // (via .UseSnakeCaseNamingConvention() on the options builder, not on ModelBuilder)

        // ── Source ────────────────────────────────────────────────────────────
        modelBuilder.Entity<Source>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Id).HasDefaultValueSql("gen_random_uuid()");
            entity.Property(s => s.CrawlerType).HasDefaultValue("cheerio");
            entity.Property(s => s.CrawlInterval).HasDefaultValue(3600);
            entity.Property(s => s.Priority).HasDefaultValue(5);
            entity.Property(s => s.IsActive).HasDefaultValue(true);
            entity.Property(s => s.CreatedAt).HasDefaultValueSql("NOW()");
            entity.Property(s => s.UpdatedAt).HasDefaultValueSql("NOW()");
            entity.Property(s => s.ParserKey).IsRequired();

            entity.HasIndex(s => s.Name).IsUnique();
            entity.HasIndex(s => s.Category);
            entity.HasIndex(s => s.IsActive).HasFilter("is_active = true");
        });

        // ── CrawlJob ──────────────────────────────────────────────────────────
        modelBuilder.Entity<CrawlJob>(entity =>
        {
            entity.HasKey(j => j.Id);
            entity.Property(j => j.Id).HasDefaultValueSql("gen_random_uuid()");
            entity.Property(j => j.Status).HasDefaultValue("pending");
            entity.Property(j => j.Priority).HasDefaultValue(5);
            entity.Property(j => j.AttemptCount).HasDefaultValue(0);
            entity.Property(j => j.ScheduledAt).HasDefaultValueSql("NOW()");
            entity.Property(j => j.CreatedAt).HasDefaultValueSql("NOW()");

            entity.HasIndex(j => j.SourceId);
            entity.HasIndex(j => j.Status);
            entity.HasIndex(j => new { j.Url, j.ContentHash });

            entity.HasOne(j => j.Source)
                  .WithMany(s => s.CrawlJobs)
                  .HasForeignKey(j => j.SourceId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // ── DataEntry ─────────────────────────────────────────────────────────
        modelBuilder.Entity<DataEntry>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasDefaultValueSql("gen_random_uuid()");
            entity.Property(e => e.CrawledAt).HasDefaultValueSql("NOW()");

            // JSONB type for flexible per-domain payload
            entity.Property(e => e.Payload).HasColumnType("jsonb");

            // GIN index enables fast JSONB queries: payload @> '{"is_active": true}'
            entity.HasIndex(e => e.Payload).HasMethod("gin");

            // UNIQUE constraint on (source_id, entry_key) for UPSERT deduplication (D-04)
            entity.HasIndex(e => new { e.SourceId, e.EntryKey }).IsUnique();

            entity.HasIndex(e => e.SourceId);
            entity.HasIndex(e => e.Category);
            entity.HasIndex(e => e.CrawledAt).IsDescending();

            entity.HasOne(e => e.Source)
                  .WithMany(s => s.DataEntries)
                  .HasForeignKey(e => e.SourceId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Job)
                  .WithMany()
                  .HasForeignKey(e => e.JobId)
                  .OnDelete(DeleteBehavior.SetNull);
        });

        // ── AlertRule ─────────────────────────────────────────────────────────
        modelBuilder.Entity<AlertRule>(entity =>
        {
            entity.HasKey(r => r.Id);
            entity.Property(r => r.Id).HasDefaultValueSql("gen_random_uuid()");
            entity.Property(r => r.IsActive).HasDefaultValue(true);
            entity.Property(r => r.CreatedAt).HasDefaultValueSql("NOW()");

            // JSONB type for flexible alert condition definition
            entity.Property(r => r.Condition).HasColumnType("jsonb");

            entity.HasIndex(r => r.SourceId);

            entity.HasOne(r => r.Source)
                  .WithMany(s => s.AlertRules)
                  .HasForeignKey(r => r.SourceId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // ── NotificationLog ───────────────────────────────────────────────────
        modelBuilder.Entity<NotificationLog>(entity =>
        {
            entity.HasKey(n => n.Id);
            entity.Property(n => n.Id).HasDefaultValueSql("gen_random_uuid()");
            entity.Property(n => n.Status).HasDefaultValue("sent");
            entity.Property(n => n.SentAt).HasDefaultValueSql("NOW()");

            entity.HasIndex(n => n.AlertRuleId);
            entity.HasIndex(n => n.SentAt).IsDescending();

            entity.HasOne(n => n.AlertRule)
                  .WithMany(r => r.NotificationLogs)
                  .HasForeignKey(n => n.AlertRuleId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(n => n.DataEntry)
                  .WithMany()
                  .HasForeignKey(n => n.DataEntryId)
                  .OnDelete(DeleteBehavior.SetNull);
        });
    }
}
