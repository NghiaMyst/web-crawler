using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using WebCrawlerApi.Parsers;

namespace WebCrawlerApi.Tests.Parsers;

public class ParserDepthTests
{
    private const string SourceId = "00000000-0000-0000-0000-000000000001";

    [Fact]
    [Trait("Category", "Unit")]
    public async Task FootballParser_Match_HasHomeAwayTeam()
    {
        var parser = new FootballParser(NullLogger<FootballParser>.Instance);
        const string raw = """
        { "matches": [ { "id": 1, "homeTeam": {"name":"Arsenal"}, "awayTeam": {"name":"Chelsea"},
          "score":{"fullTime":{"home":2,"away":1}}, "utcDate":"2026-05-25T15:00:00Z", "status":"FINISHED" } ] }
        """;
        var results = await parser.ParseAsync(raw, SourceId);
        Assert.NotEmpty(results);
        var payload = JsonSerializer.SerializeToElement(results[0].Payload);
        Assert.False(string.IsNullOrWhiteSpace(payload.GetProperty("home_team").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(payload.GetProperty("away_team").GetString()));
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task FootballParser_Standings_HasTeam()
    {
        var parser = new FootballParser(NullLogger<FootballParser>.Instance);
        const string raw = """
        { "standings":[{"table":[{"team":{"id":57,"name":"Arsenal"},"position":1,"points":50,
          "playedGames":20,"won":15,"draw":5,"lost":0,"goalsFor":40,"goalsAgainst":10,"goalDifference":30}]}] }
        """;
        var results = await parser.ParseAsync(raw, SourceId);
        Assert.NotEmpty(results);
        var payload = JsonSerializer.SerializeToElement(results[0].Payload);
        Assert.False(string.IsNullOrWhiteSpace(payload.GetProperty("team").GetString()));
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task GenshinParser_HasEventName()
    {
        var parser = new GenshinParser(NullLogger<GenshinParser>.Instance);
        const string raw = """
        { "data": { "list": [ { "id": "evt_123", "name": "Test Event" } ] } }
        """;
        var results = await parser.ParseAsync(raw, SourceId);
        Assert.NotEmpty(results);
        var payload = JsonSerializer.SerializeToElement(results[0].Payload);
        Assert.False(string.IsNullOrWhiteSpace(payload.GetProperty("event_name").GetString()));
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task LolParser_HasChampion()
    {
        var parser = new LolParser(NullLogger<LolParser>.Instance);
        const string raw = """
        { "props": { "pageProps": { "data": [
          { "championName":"Ahri", "role":"mid", "tier":"S", "patch":"14.10" } ] } } }
        """;
        var results = await parser.ParseAsync(raw, SourceId);
        Assert.NotEmpty(results);
        var payload = JsonSerializer.SerializeToElement(results[0].Payload);
        Assert.False(string.IsNullOrWhiteSpace(payload.GetProperty("champion").GetString()));
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task AniListParser_HasTitleAndStatus()
    {
        var parser = new AniListParser(NullLogger<AniListParser>.Instance);
        const string raw = """
        { "data": { "Page": { "media": [
          { "id": 1, "title": {"english":"Test Anime","romaji":"Tesuto"},
            "status":"RELEASING",
            "nextAiringEpisode": {"airingAt": 1700000000, "episode": 3} } ] } } }
        """;
        var results = await parser.ParseAsync(raw, SourceId);
        Assert.NotEmpty(results);
        var payload = JsonSerializer.SerializeToElement(results[0].Payload);
        Assert.False(string.IsNullOrWhiteSpace(payload.GetProperty("title").GetString()));
        // status must be present after Plan 01 worker fix
        var statusProp = payload.GetProperty("status");
        Assert.True(statusProp.ValueKind == JsonValueKind.String &&
                    !string.IsNullOrWhiteSpace(statusProp.GetString()));
    }

    [Fact]
    [Trait("Category", "Unit")]
    public async Task MangaDexParser_HasMangaTitle()
    {
        var parser = new MangaDexParser(NullLogger<MangaDexParser>.Instance);
        const string raw = """
        { "data": [ { "id":"ch-1", "type":"chapter",
          "attributes":{"chapter":"1","title":"First","volume":"1","publishAt":"2026-01-01T00:00:00Z","translatedLanguage":"en"},
          "relationships":[{"type":"manga","attributes":{"title":{"en":"Test Manga"}}}] } ], "total":1 }
        """;
        var results = await parser.ParseAsync(raw, SourceId);
        Assert.NotEmpty(results);
        var payload = JsonSerializer.SerializeToElement(results[0].Payload);
        var mangaTitle = payload.GetProperty("manga_title");
        Assert.True(mangaTitle.ValueKind == JsonValueKind.String &&
                    !string.IsNullOrWhiteSpace(mangaTitle.GetString()));
    }
}
