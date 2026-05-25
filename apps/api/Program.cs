using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Prometheus;
using Serilog;
using StackExchange.Redis;
using WebCrawlerApi.Data;
using WebCrawlerApi.Endpoints;
using WebCrawlerApi.Hubs;
using WebCrawlerApi.Parsers;
using WebCrawlerApi.Services;

// Bootstrap logger for startup errors (before host is built)
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // Wire Serilog — reads config from appsettings.json Serilog section
    // Business code uses ILogger<T> from Microsoft.Extensions.Logging, NOT Serilog directly
    builder.Host.UseSerilog((context, services, configuration) =>
        configuration
            .ReadFrom.Configuration(context.Configuration)
            .ReadFrom.Services(services)
            .Enrich.FromLogContext());

    // Register EF Core with Npgsql and snake_case naming convention
    builder.Services.AddDbContext<AppDbContext>(opt =>
        opt.UseNpgsql(builder.Configuration["DATABASE_URL"]
               ?? throw new InvalidOperationException("DATABASE_URL not set"))
           .UseSnakeCaseNamingConvention());

    // Redis connection for raw content reads (D-03)
    var redisConnStr = builder.Configuration["REDIS_URL"] ?? "localhost:6379";
    var redisEndpoint = redisConnStr.Replace("redis://", "");
    builder.Services.AddSingleton<IConnectionMultiplexer>(
        ConnectionMultiplexer.Connect(redisEndpoint));

    // Keyed parser services — PARSE-02 (no hardcoded switch)
    // Stub implementations replaced by plans 03-04 and 03-05
    builder.Services.AddKeyedScoped<IContentParser, FootballParser>("football");
    builder.Services.AddKeyedScoped<IContentParser, GenshinParser>("genshin");
    builder.Services.AddKeyedScoped<IContentParser, LolParser>("lol");
    builder.Services.AddKeyedScoped<IContentParser, AniListParser>("anilist");
    builder.Services.AddKeyedScoped<IContentParser, MangaDexParser>("mangadex");

    // ── Phase 4: Notification Engine services ──
    builder.Services.AddHttpClient<TelegramSender>()
        .AddStandardResilienceHandler();
    builder.Services.AddHttpClient<DiscordSender>()
        .AddStandardResilienceHandler();

    builder.Services.AddScoped<INotificationSender, TelegramSender>(sp =>
        sp.GetRequiredService<TelegramSender>());
    builder.Services.AddScoped<INotificationSender, DiscordSender>(sp =>
        sp.GetRequiredService<DiscordSender>());

    builder.Services.AddScoped<AlertRuleEvaluator>();
    builder.Services.AddScoped<NotificationDispatcher>();

    // LISTEN/NOTIFY background service
    builder.Services.AddHostedService<CrawlerEventListener>();

    // ── Phase 5: REST API services ──
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen();

    // ── Phase 6: SignalR real-time layer ──
    builder.Services.AddSignalR();
    builder.Services.AddSingleton<HubConnectionTracker>();

    builder.Services.AddCors(options =>
    {
        options.AddDefaultPolicy(policy =>
            policy.WithOrigins(
                    Environment.GetEnvironmentVariable("CORS_ALLOWED_ORIGINS")?.Split(',')
                        ?? new[] { "http://localhost:3000" })
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials());
    });

    builder.Services.ConfigureHttpJsonOptions(options =>
    {
        options.SerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
        options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    });

    var app = builder.Build();

    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        // Skip migration when using InMemory provider (e.g. during integration tests)
        if (db.Database.IsRelational())
            db.Database.Migrate();
    }

    // Log every HTTP request with timing
    app.UseSerilogRequestLogging();
    app.UseRouting();    // Required — UseHttpMetrics needs routing to be configured
    app.UseHttpMetrics(options =>
    {
        options.ReduceStatusCodeCardinality();  // Groups 2xx/3xx/4xx/5xx — reduces label cardinality
    });

    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI();
    }

    app.UseCors();
    app.UseStaticFiles();
    app.MapHub<DashboardHub>("/hubs/dashboard");

    app.MapGet("/health", async (AppDbContext db, IConnectionMultiplexer redis,
        HubConnectionTracker hubTracker) =>
        await HealthCheck.CheckHealth(
            () => db.Database.ExecuteSqlRawAsync("SELECT 1"),
            async () => { await redis.GetDatabase().PingAsync(); },
            hubTracker.Count));

    app.MapGroup("/api/entries").MapEntriesEndpoints();
    app.MapGroup("/api/sources").MapSourcesEndpoints();
    app.MapGroup("/api/jobs").MapJobsEndpoints();
    app.MapGroup("/api/alert-rules").MapAlertRulesEndpoints();
    app.MapGroup("/api/notifications").MapNotificationsEndpoints();
    app.MapGroup("/api/stats").MapStatsEndpoints();
    app.MapMetrics();  // Exposes GET /metrics with Prometheus text format

    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application startup failed");
    throw;
}
finally
{
    Log.CloseAndFlush();
}

// Make Program accessible for WebApplicationFactory in integration tests
public partial class Program { }
