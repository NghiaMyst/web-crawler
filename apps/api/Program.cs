using Microsoft.EntityFrameworkCore;
using Serilog;
using WebCrawlerApi.Data;

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
        opt.UseNpgsql(Environment.GetEnvironmentVariable("DATABASE_URL")
               ?? throw new InvalidOperationException("DATABASE_URL env var not set"))
           .UseSnakeCaseNamingConvention());

    var app = builder.Build();

    // Log every HTTP request with timing
    app.UseSerilogRequestLogging();

    app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "api" }));

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
