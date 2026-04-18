using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using WebCrawlerApi.Data;
using WebCrawlerApi.Data.Entities;

namespace WebCrawlerApi.Endpoints;

public static class JobsEndpoints
{
    public static RouteGroupBuilder MapJobsEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetJobs);
        group.MapPost("/{id:guid}/retry", RetryJob);
        return group;
    }

    internal static async Task<IResult> GetJobs(AppDbContext db, string? status = null)
    {
        var query = db.CrawlJobs.AsNoTracking().AsQueryable();

        if (status is not null)
            query = query.Where(j => j.Status == status);

        var jobs = await query.OrderByDescending(j => j.CreatedAt).ToListAsync();
        return Results.Ok(jobs);
    }

    internal static async Task<IResult> RetryJob(
        Guid id, AppDbContext db, IConnectionMultiplexer redis)
    {
        var job = await db.CrawlJobs.FindAsync(id);
        if (job is null) return Results.NotFound();
        if (job.Status != "failed")
            return Results.BadRequest(new { error = "Job is not in failed state" });

        // D-06 step 1: Reset job in PostgreSQL
        job.Status = "pending";
        job.AttemptCount = 0;  // D-07: fresh 3-attempt budget
        job.ErrorMessage = null;
        await db.SaveChangesAsync();

        // D-06 step 2: Signal Node.js crawler via Redis Pub/Sub
        var sub = redis.GetSubscriber();
        await sub.PublishAsync(
            RedisChannel.Literal("retry-job"),
            id.ToString());

        return Results.Ok(new { jobId = id, status = "pending" });
    }
}
