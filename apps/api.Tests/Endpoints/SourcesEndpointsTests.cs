using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WebCrawlerApi.Data;
using WebCrawlerApi.Data.Entities;
using WebCrawlerApi.Endpoints;

namespace WebCrawlerApi.Tests.Endpoints;

public class SourcesEndpointsTests
{
    private static AppDbContext CreateInMemoryDb(string dbName)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(dbName)
            .Options;
        return new AppDbContext(options);
    }

    private static CreateSourceRequest ValidCreateRequest() => new(
        Name: "test-source",
        DisplayName: "Test Source",
        Url: "https://example.com",
        Category: "test",
        ParserKey: "test-parser"
    );

    // Test 1: GET / returns empty list when no sources exist
    [Fact]
    public async Task GetAllSources_NoSources_ReturnsEmptyList()
    {
        using var db = CreateInMemoryDb(nameof(GetAllSources_NoSources_ReturnsEmptyList));
        var result = await SourcesEndpoints.GetAllSources(db);
        var ok = Assert.IsType<Ok<List<Source>>>(result);
        Assert.NotNull(ok.Value);
        Assert.Empty(ok.Value);
    }

    // Test 2: GET / returns all sources when sources exist
    [Fact]
    public async Task GetAllSources_WithSources_ReturnsAllSources()
    {
        using var db = CreateInMemoryDb(nameof(GetAllSources_WithSources_ReturnsAllSources));
        db.Sources.Add(new Source { Id = Guid.NewGuid(), Name = "s1", Url = "https://a.com", ParserKey = "pk1", UpdatedAt = DateTimeOffset.UtcNow });
        db.Sources.Add(new Source { Id = Guid.NewGuid(), Name = "s2", Url = "https://b.com", ParserKey = "pk2", UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();

        var result = await SourcesEndpoints.GetAllSources(db);
        var ok = Assert.IsType<Ok<List<Source>>>(result);
        Assert.Equal(2, ok.Value!.Count);
    }

    // Test 3: POST / with valid body creates source, returns 201 with Location header
    [Fact]
    public async Task CreateSource_ValidRequest_Returns201WithSource()
    {
        using var db = CreateInMemoryDb(nameof(CreateSource_ValidRequest_Returns201WithSource));
        var req = ValidCreateRequest();
        var result = await SourcesEndpoints.CreateSource(req, db);
        var created = Assert.IsType<Created<Source>>(result);
        Assert.Equal(201, created.StatusCode);
        Assert.NotNull(created.Value);
        Assert.Equal("test-source", created.Value!.Name);
        Assert.StartsWith("/api/sources/", created.Location);
        Assert.Equal(1, await db.Sources.CountAsync());
    }

    // Test 4: POST / with missing Name returns 400 ValidationProblem with "name" error key
    [Fact]
    public async Task CreateSource_MissingName_Returns400WithNameError()
    {
        using var db = CreateInMemoryDb(nameof(CreateSource_MissingName_Returns400WithNameError));
        var req = new CreateSourceRequest(Name: "", DisplayName: null, Url: "https://example.com", Category: null, ParserKey: "pk");
        var result = await SourcesEndpoints.CreateSource(req, db);
        var problem = Assert.IsType<ProblemHttpResult>(result);
        var details = Assert.IsType<HttpValidationProblemDetails>(problem.ProblemDetails);
        Assert.True(details.Errors.ContainsKey("name"));
    }

    // Test 5: POST / with missing Url returns 400 ValidationProblem with "url" error key
    [Fact]
    public async Task CreateSource_MissingUrl_Returns400WithUrlError()
    {
        using var db = CreateInMemoryDb(nameof(CreateSource_MissingUrl_Returns400WithUrlError));
        var req = new CreateSourceRequest(Name: "s1", DisplayName: null, Url: "", Category: null, ParserKey: "pk");
        var result = await SourcesEndpoints.CreateSource(req, db);
        var problem = Assert.IsType<ProblemHttpResult>(result);
        var details = Assert.IsType<HttpValidationProblemDetails>(problem.ProblemDetails);
        Assert.True(details.Errors.ContainsKey("url"));
    }

    // Test 6: POST / with missing ParserKey returns 400 ValidationProblem with "parserKey" error key
    [Fact]
    public async Task CreateSource_MissingParserKey_Returns400WithParserKeyError()
    {
        using var db = CreateInMemoryDb(nameof(CreateSource_MissingParserKey_Returns400WithParserKeyError));
        var req = new CreateSourceRequest(Name: "s1", DisplayName: null, Url: "https://example.com", Category: null, ParserKey: "");
        var result = await SourcesEndpoints.CreateSource(req, db);
        var problem = Assert.IsType<ProblemHttpResult>(result);
        var details = Assert.IsType<HttpValidationProblemDetails>(problem.ProblemDetails);
        Assert.True(details.Errors.ContainsKey("parserKey"));
    }

    // Test 7: PUT /{id} updates CrawlInterval and IsActive on existing source
    [Fact]
    public async Task UpdateSource_ExistingId_UpdatesFields()
    {
        using var db = CreateInMemoryDb(nameof(UpdateSource_ExistingId_UpdatesFields));
        var id = Guid.NewGuid();
        db.Sources.Add(new Source { Id = id, Name = "src", Url = "https://a.com", ParserKey = "pk", CrawlInterval = 3600, IsActive = true, UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();

        var req = new UpdateSourceRequest(DisplayName: null, Url: null, CrawlInterval: 7200, Priority: null, IsActive: false);
        var result = await SourcesEndpoints.UpdateSource(id, req, db);
        var ok = Assert.IsType<Ok<Source>>(result);
        Assert.Equal(7200, ok.Value!.CrawlInterval);
        Assert.False(ok.Value.IsActive);
    }

    // Test 8: PUT /{id} with non-existent Guid returns 404
    [Fact]
    public async Task UpdateSource_NonExistentId_Returns404()
    {
        using var db = CreateInMemoryDb(nameof(UpdateSource_NonExistentId_Returns404));
        var req = new UpdateSourceRequest(DisplayName: null, Url: null, CrawlInterval: null, Priority: null, IsActive: null);
        var result = await SourcesEndpoints.UpdateSource(Guid.NewGuid(), req, db);
        Assert.IsType<NotFound>(result);
    }

    // Test 9: DELETE /{id} removes source, subsequent GET / does not include it
    [Fact]
    public async Task DeleteSource_ExistingId_RemovesSource()
    {
        using var db = CreateInMemoryDb(nameof(DeleteSource_ExistingId_RemovesSource));
        var id = Guid.NewGuid();
        db.Sources.Add(new Source { Id = id, Name = "src", Url = "https://a.com", ParserKey = "pk", UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();

        var deleteResult = await SourcesEndpoints.DeleteSource(id, db);
        Assert.IsType<NoContent>(deleteResult);

        var getResult = await SourcesEndpoints.GetAllSources(db);
        var ok = Assert.IsType<Ok<List<Source>>>(getResult);
        Assert.Empty(ok.Value!);
    }

    // Test 10: DELETE /{id} with non-existent Guid returns 404
    [Fact]
    public async Task DeleteSource_NonExistentId_Returns404()
    {
        using var db = CreateInMemoryDb(nameof(DeleteSource_NonExistentId_Returns404));
        var result = await SourcesEndpoints.DeleteSource(Guid.NewGuid(), db);
        Assert.IsType<NotFound>(result);
    }
}
