using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using WebCrawlerApi.Data;
using WebCrawlerApi.Data.Entities;
using WebCrawlerApi.Endpoints;

namespace WebCrawlerApi.Tests.Endpoints;

public class AlertRulesEndpointsTests
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

    private static CreateAlertRuleRequest ValidRequest(Guid sourceId) => new CreateAlertRuleRequest(
        SourceId: sourceId,
        Name: "Test Rule",
        Condition: JsonDocument.Parse("""{"type":"new_item"}""").RootElement,
        MessageTpl: "New item found",
        Channel: "telegram"
    );

    [Fact]
    public async Task GetAlertRules_NoRules_ReturnsEmptyList()
    {
        var db = CreateInMemoryDb(nameof(GetAlertRules_NoRules_ReturnsEmptyList));

        var result = await AlertRulesEndpoints.GetAlertRules(db);

        var okResult = Assert.IsType<Ok<List<AlertRule>>>(result);
        Assert.Empty(okResult.Value!);
    }

    [Fact]
    public async Task GetAlertRules_WithRules_ReturnsAllRules()
    {
        var db = CreateInMemoryDb(nameof(GetAlertRules_WithRules_ReturnsAllRules));
        var source = CreateSource();
        db.Sources.Add(source);
        db.AlertRules.AddRange(
            new AlertRule { Id = Guid.NewGuid(), SourceId = source.Id, Name = "Rule 1", Condition = JsonDocument.Parse("{}"), Channel = "telegram", CreatedAt = DateTimeOffset.UtcNow },
            new AlertRule { Id = Guid.NewGuid(), SourceId = source.Id, Name = "Rule 2", Condition = JsonDocument.Parse("{}"), Channel = "discord", CreatedAt = DateTimeOffset.UtcNow }
        );
        await db.SaveChangesAsync();

        var result = await AlertRulesEndpoints.GetAlertRules(db);

        var okResult = Assert.IsType<Ok<List<AlertRule>>>(result);
        Assert.Equal(2, okResult.Value!.Count);
    }

    [Fact]
    public async Task CreateAlertRule_ValidRequest_Returns201Created()
    {
        var db = CreateInMemoryDb(nameof(CreateAlertRule_ValidRequest_Returns201Created));
        var source = CreateSource();
        db.Sources.Add(source);
        await db.SaveChangesAsync();

        var result = await AlertRulesEndpoints.CreateAlertRule(ValidRequest(source.Id), db);

        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(201, statusResult.StatusCode);
        Assert.Equal(1, await db.AlertRules.CountAsync());
    }

    [Fact]
    public async Task CreateAlertRule_MissingName_Returns400ValidationProblem()
    {
        var db = CreateInMemoryDb(nameof(CreateAlertRule_MissingName_Returns400ValidationProblem));
        var source = CreateSource();
        db.Sources.Add(source);
        await db.SaveChangesAsync();

        var req = new CreateAlertRuleRequest(
            SourceId: source.Id,
            Name: "",
            Condition: null,
            MessageTpl: null,
            Channel: "telegram"
        );

        var result = await AlertRulesEndpoints.CreateAlertRule(req, db);

        Assert.IsType<ValidationProblem>(result);
    }

    [Fact]
    public async Task CreateAlertRule_MissingSourceId_Returns400ValidationProblem()
    {
        var db = CreateInMemoryDb(nameof(CreateAlertRule_MissingSourceId_Returns400ValidationProblem));

        var req = new CreateAlertRuleRequest(
            SourceId: Guid.Empty,
            Name: "Rule",
            Condition: null,
            MessageTpl: null,
            Channel: "telegram"
        );

        var result = await AlertRulesEndpoints.CreateAlertRule(req, db);

        Assert.IsType<ValidationProblem>(result);
    }

    [Fact]
    public async Task CreateAlertRule_MissingChannel_Returns400ValidationProblem()
    {
        var db = CreateInMemoryDb(nameof(CreateAlertRule_MissingChannel_Returns400ValidationProblem));
        var source = CreateSource();
        db.Sources.Add(source);
        await db.SaveChangesAsync();

        var req = new CreateAlertRuleRequest(
            SourceId: source.Id,
            Name: "Rule",
            Condition: null,
            MessageTpl: null,
            Channel: ""
        );

        var result = await AlertRulesEndpoints.CreateAlertRule(req, db);

        Assert.IsType<ValidationProblem>(result);
    }

    [Fact]
    public async Task DeleteAlertRule_ExistingId_Returns204NoContent()
    {
        var db = CreateInMemoryDb(nameof(DeleteAlertRule_ExistingId_Returns204NoContent));
        var source = CreateSource();
        var ruleId = Guid.NewGuid();
        db.Sources.Add(source);
        db.AlertRules.Add(new AlertRule
        {
            Id = ruleId,
            SourceId = source.Id,
            Name = "Rule to delete",
            Condition = JsonDocument.Parse("{}"),
            Channel = "telegram",
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        var result = await AlertRulesEndpoints.DeleteAlertRule(ruleId, db);

        Assert.IsType<NoContent>(result);
        Assert.Equal(0, await db.AlertRules.CountAsync());
    }

    [Fact]
    public async Task DeleteAlertRule_NonExistentId_Returns404NotFound()
    {
        var db = CreateInMemoryDb(nameof(DeleteAlertRule_NonExistentId_Returns404NotFound));

        var result = await AlertRulesEndpoints.DeleteAlertRule(Guid.NewGuid(), db);

        Assert.IsType<NotFound>(result);
    }
}
