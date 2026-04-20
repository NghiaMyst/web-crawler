using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using StackExchange.Redis;
using WebCrawlerApi.Data;
using WebCrawlerApi.Parsers;
using WebCrawlerApi.Services;

namespace WebCrawlerApi.Services;

public class CrawlerEventListener(
    IServiceScopeFactory scopeFactory,
    IConnectionMultiplexer redis,
    IConfiguration configuration,
    ILogger<CrawlerEventListener> logger) : BackgroundService
{
    private const string Channel = "crawler_events";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // DEDICATED connection — NOT from EF Core pool (LISTEN is session-scoped)
        var connStr = configuration["DATABASE_URL"]
            ?? throw new InvalidOperationException("DATABASE_URL not set");
        connStr += ";Keepalive=30";

        await using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync(stoppingToken);

        conn.Notification += (_, args) =>
        {
            logger.LogInformation("NOTIFY received on {Channel}: {Payload}",
                args.Channel, args.Payload);
            _ = HandleNotificationAsync(args.Payload, stoppingToken);
        };

        await using (var cmd = new NpgsqlCommand($"LISTEN {Channel}", conn))
        {
            await cmd.ExecuteNonQueryAsync(stoppingToken);
        }

        logger.LogInformation("Listening on PostgreSQL channel: {Channel}", Channel);

        while (!stoppingToken.IsCancellationRequested)
        {
            await conn.WaitAsync(stoppingToken);
        }
    }

    private async Task HandleNotificationAsync(string payload, CancellationToken ct)
    {
        try
        {
            var msg = JsonSerializer.Deserialize<CrawlerNotification>(payload)
                ?? throw new JsonException("Failed to deserialize notification");

            logger.LogInformation("Dispatching parser for key={ParserKey}, jobId={JobId}",
                msg.ParserKey, msg.JobId);

            // Create scope per notification — avoids captive dependency
            using var scope = scopeFactory.CreateScope();
            var parser = scope.ServiceProvider
                .GetRequiredKeyedService<IContentParser>(msg.ParserKey);

            logger.LogInformation("Resolved parser: {ParserType}", parser.GetType().Name);

            var redisDb = redis.GetDatabase();
            var raw = await redisDb.StringGetAsync($"job:raw:{msg.JobId}");
            if (raw.IsNullOrEmpty)
            {
                logger.LogWarning("Redis key job:raw:{JobId} missing or expired", msg.JobId);
                return;
            }

            var results = await parser.ParseAsync(raw!, msg.SourceId, ct);
            logger.LogInformation("Parser produced {Count} entries", results.Count);

            // UPSERT each parsed entry (D-04) + evaluate and notify (D-01, D-02)
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            foreach (var entry in results)
            {
                // D-02: SELECT before UPSERT to capture old payload for diff
                var sourceId = Guid.Parse(entry.SourceId);
                var existing = await db.DataEntries
                    .AsNoTracking()
                    .FirstOrDefaultAsync(e =>
                        e.SourceId == sourceId &&
                        e.EntryKey == entry.EntryKey, ct);

                // Clone old payload before upsert overwrites it
                JsonDocument? oldPayload = null;
                if (existing?.Payload is not null)
                {
                    // Clone to detach from EF Core tracked entity buffer
                    oldPayload = JsonDocument.Parse(existing.Payload.RootElement.GetRawText());
                }

                await UpsertEntryAsync(db, entry, msg.JobId, ct);

                // D-01: Evaluate and notify inline after upsert
                await EvaluateAndNotifyAsync(db, sourceId, entry, oldPayload, msg.JobId, ct);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed handling notification: {Payload}", payload);
        }
    }

    private async Task EvaluateAndNotifyAsync(
        AppDbContext db,
        Guid sourceId,
        ParsedEntry entry,
        JsonDocument? oldPayload,
        string jobId,
        CancellationToken ct)
    {
        try
        {
            // Build new payload as JsonDocument for diff comparison
            var newPayloadJson = JsonSerializer.Serialize(entry.Payload);
            using var newPayload = JsonDocument.Parse(newPayloadJson);

            // Run diff engine
            var diff = DiffEngine.Compare(oldPayload, newPayload);

            // Re-read the upserted entry to get its DB-assigned Id for notification_logs FK
            var upserted = await db.DataEntries
                .AsNoTracking()
                .FirstOrDefaultAsync(e =>
                    e.SourceId == sourceId &&
                    e.EntryKey == entry.EntryKey, ct);

            if (upserted is null)
            {
                logger.LogWarning("Could not find upserted entry for key {EntryKey}", entry.EntryKey);
                return;
            }

            // Resolve NotificationDispatcher from scope
            var dispatcher = scopeFactory.CreateScope().ServiceProvider
                .GetRequiredService<NotificationDispatcher>();

            // Clone newPayload for dispatcher (original will be disposed at end of using block)
            var dispatchPayload = JsonDocument.Parse(newPayloadJson);

            await dispatcher.DispatchAsync(db, sourceId, upserted.Id, diff, dispatchPayload, ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Notification evaluation failed for entry {EntryKey}", entry.EntryKey);
            // Don't rethrow — notification failure must not block the parse loop
        }
        finally
        {
            oldPayload?.Dispose();
        }
    }

    private static async Task UpsertEntryAsync(
        AppDbContext db, ParsedEntry entry, string jobId, CancellationToken ct)
    {
        // Raw SQL UPSERT — ON CONFLICT on UNIQUE(source_id, entry_key) per D-04
        // All values passed as EF Core parameterized placeholders — no string concatenation (T-03-07)
        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO data_entries (id, source_id, job_id, category, entry_key, payload, crawled_at)
            VALUES (gen_random_uuid(), {0}::uuid, {1}::uuid, {2}, {3}, {4}::jsonb, NOW())
            ON CONFLICT (source_id, entry_key)
            DO UPDATE SET
                payload = EXCLUDED.payload,
                job_id = EXCLUDED.job_id,
                crawled_at = NOW()
            """,
            entry.SourceId, jobId, entry.Category, entry.EntryKey,
            JsonSerializer.Serialize(entry.Payload), ct);
    }
}

public record CrawlerNotification(
    [property: JsonPropertyName("job_id")] string JobId,
    [property: JsonPropertyName("source_id")] string SourceId,
    [property: JsonPropertyName("parser_key")] string ParserKey);
