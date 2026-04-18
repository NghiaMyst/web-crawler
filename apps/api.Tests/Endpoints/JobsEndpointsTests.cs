using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Moq;
using StackExchange.Redis;
using WebCrawlerApi.Data;
using WebCrawlerApi.Data.Entities;
using WebCrawlerApi.Endpoints;

namespace WebCrawlerApi.Tests.Endpoints;

public class JobsEndpointsTests
{
    private static AppDbContext CreateInMemoryDb(string dbName)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(dbName)
            .Options;
        return new AppDbContext(options);
    }

    private static Source CreateSource() => new Source
    {
        Id = Guid.NewGuid(),
        Name = "test-source",
        DisplayName = "Test Source",
        Url = "https://example.com",
        Category = "test",
        ParserKey = "test"
    };

    [Fact]
    public async Task GetJobs_NoFilter_ReturnsAllJobs()
    {
        var db = CreateInMemoryDb(nameof(GetJobs_NoFilter_ReturnsAllJobs));
        var source = CreateSource();
        db.Sources.Add(source);
        db.CrawlJobs.AddRange(
            new CrawlJob { Id = Guid.NewGuid(), SourceId = source.Id, Url = "https://a.com", Status = "pending", ScheduledAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow },
            new CrawlJob { Id = Guid.NewGuid(), SourceId = source.Id, Url = "https://b.com", Status = "failed", ScheduledAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow },
            new CrawlJob { Id = Guid.NewGuid(), SourceId = source.Id, Url = "https://c.com", Status = "done", ScheduledAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow }
        );
        await db.SaveChangesAsync();

        var result = await JobsEndpoints.GetJobs(db, null);

        var ok = Assert.IsAssignableFrom<IResult>(result);
        var okResult = Assert.IsType<Ok<List<CrawlJob>>>(ok);
        Assert.Equal(3, okResult.Value!.Count);
    }

    [Fact]
    public async Task GetJobs_FilterByFailed_ReturnsOnlyFailedJobs()
    {
        var db = CreateInMemoryDb(nameof(GetJobs_FilterByFailed_ReturnsOnlyFailedJobs));
        var source = CreateSource();
        db.Sources.Add(source);
        db.CrawlJobs.AddRange(
            new CrawlJob { Id = Guid.NewGuid(), SourceId = source.Id, Url = "https://a.com", Status = "pending", ScheduledAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow },
            new CrawlJob { Id = Guid.NewGuid(), SourceId = source.Id, Url = "https://b.com", Status = "failed", ScheduledAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow },
            new CrawlJob { Id = Guid.NewGuid(), SourceId = source.Id, Url = "https://c.com", Status = "failed", ScheduledAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow }
        );
        await db.SaveChangesAsync();

        var result = await JobsEndpoints.GetJobs(db, "failed");

        var okResult = Assert.IsType<Ok<List<CrawlJob>>>(result);
        Assert.Equal(2, okResult.Value!.Count);
        Assert.All(okResult.Value, j => Assert.Equal("failed", j.Status));
    }

    [Fact]
    public async Task GetJobs_FilterByPending_ReturnsOnlyPendingJobs()
    {
        var db = CreateInMemoryDb(nameof(GetJobs_FilterByPending_ReturnsOnlyPendingJobs));
        var source = CreateSource();
        db.Sources.Add(source);
        db.CrawlJobs.AddRange(
            new CrawlJob { Id = Guid.NewGuid(), SourceId = source.Id, Url = "https://a.com", Status = "pending", ScheduledAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow },
            new CrawlJob { Id = Guid.NewGuid(), SourceId = source.Id, Url = "https://b.com", Status = "pending", ScheduledAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow },
            new CrawlJob { Id = Guid.NewGuid(), SourceId = source.Id, Url = "https://c.com", Status = "done", ScheduledAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow }
        );
        await db.SaveChangesAsync();

        var result = await JobsEndpoints.GetJobs(db, "pending");

        var okResult = Assert.IsType<Ok<List<CrawlJob>>>(result);
        Assert.Equal(2, okResult.Value!.Count);
        Assert.All(okResult.Value, j => Assert.Equal("pending", j.Status));
    }

    [Fact]
    public async Task RetryJob_FailedJob_SetsStatusToPendingAndAttemptCountZero()
    {
        var db = CreateInMemoryDb(nameof(RetryJob_FailedJob_SetsStatusToPendingAndAttemptCountZero));
        var source = CreateSource();
        var jobId = Guid.NewGuid();
        db.Sources.Add(source);
        db.CrawlJobs.Add(new CrawlJob
        {
            Id = jobId,
            SourceId = source.Id,
            Url = "https://a.com",
            Status = "failed",
            AttemptCount = 3,
            ErrorMessage = "some error",
            ScheduledAt = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        var mockSubscriber = new Mock<ISubscriber>();
        mockSubscriber.Setup(s => s.PublishAsync(
            It.IsAny<RedisChannel>(),
            It.IsAny<RedisValue>(),
            It.IsAny<CommandFlags>())).ReturnsAsync(1L);
        var mockRedis = new Mock<IConnectionMultiplexer>();
        mockRedis.Setup(r => r.GetSubscriber(null)).Returns(mockSubscriber.Object);

        await JobsEndpoints.RetryJob(jobId, db, mockRedis.Object);

        var updated = await db.CrawlJobs.FindAsync(jobId);
        Assert.Equal("pending", updated!.Status);
        Assert.Equal(0, updated.AttemptCount);
        Assert.Null(updated.ErrorMessage);
    }

    [Fact]
    public async Task RetryJob_FailedJob_PublishesToRedisRetryJobChannel()
    {
        var db = CreateInMemoryDb(nameof(RetryJob_FailedJob_PublishesToRedisRetryJobChannel));
        var source = CreateSource();
        var jobId = Guid.NewGuid();
        db.Sources.Add(source);
        db.CrawlJobs.Add(new CrawlJob
        {
            Id = jobId,
            SourceId = source.Id,
            Url = "https://a.com",
            Status = "failed",
            ScheduledAt = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        var mockSubscriber = new Mock<ISubscriber>();
        mockSubscriber.Setup(s => s.PublishAsync(
            It.IsAny<RedisChannel>(),
            It.IsAny<RedisValue>(),
            It.IsAny<CommandFlags>())).ReturnsAsync(1L);
        var mockRedis = new Mock<IConnectionMultiplexer>();
        mockRedis.Setup(r => r.GetSubscriber(null)).Returns(mockSubscriber.Object);

        await JobsEndpoints.RetryJob(jobId, db, mockRedis.Object);

        mockSubscriber.Verify(s => s.PublishAsync(
            It.Is<RedisChannel>(c => c == RedisChannel.Literal("retry-job")),
            It.Is<RedisValue>(v => v == jobId.ToString()),
            It.IsAny<CommandFlags>()), Times.Once);
    }

    [Fact]
    public async Task RetryJob_NonFailedJob_Returns400BadRequest()
    {
        var db = CreateInMemoryDb(nameof(RetryJob_NonFailedJob_Returns400BadRequest));
        var source = CreateSource();
        var jobId = Guid.NewGuid();
        db.Sources.Add(source);
        db.CrawlJobs.Add(new CrawlJob
        {
            Id = jobId,
            SourceId = source.Id,
            Url = "https://a.com",
            Status = "running",
            ScheduledAt = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        var mockRedis = new Mock<IConnectionMultiplexer>();

        var result = await JobsEndpoints.RetryJob(jobId, db, mockRedis.Object);

        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(400, statusResult.StatusCode);
    }

    [Fact]
    public async Task RetryJob_NonExistentId_Returns404NotFound()
    {
        var db = CreateInMemoryDb(nameof(RetryJob_NonExistentId_Returns404NotFound));
        var mockRedis = new Mock<IConnectionMultiplexer>();

        var result = await JobsEndpoints.RetryJob(Guid.NewGuid(), db, mockRedis.Object);

        Assert.IsType<NotFound>(result);
    }

    [Fact]
    public async Task RetryJob_FailedJob_ReturnsOkWithJobIdAndPendingStatus()
    {
        var db = CreateInMemoryDb(nameof(RetryJob_FailedJob_ReturnsOkWithJobIdAndPendingStatus));
        var source = CreateSource();
        var jobId = Guid.NewGuid();
        db.Sources.Add(source);
        db.CrawlJobs.Add(new CrawlJob
        {
            Id = jobId,
            SourceId = source.Id,
            Url = "https://a.com",
            Status = "failed",
            ScheduledAt = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        var mockSubscriber = new Mock<ISubscriber>();
        mockSubscriber.Setup(s => s.PublishAsync(
            It.IsAny<RedisChannel>(),
            It.IsAny<RedisValue>(),
            It.IsAny<CommandFlags>())).ReturnsAsync(1L);
        var mockRedis = new Mock<IConnectionMultiplexer>();
        mockRedis.Setup(r => r.GetSubscriber(null)).Returns(mockSubscriber.Object);

        var result = await JobsEndpoints.RetryJob(jobId, db, mockRedis.Object);

        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(200, statusResult.StatusCode);
        var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var json = System.Text.Json.JsonSerializer.Serialize(valueResult.Value);
        Assert.Contains(jobId.ToString(), json);
        Assert.Contains("pending", json);
    }
}
