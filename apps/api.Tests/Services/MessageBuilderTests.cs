using System.Text.Json;
using WebCrawlerApi.Data.Entities;
using WebCrawlerApi.Models.Notifications;
using WebCrawlerApi.Services;

namespace WebCrawlerApi.Tests.Services;

public class MessageBuilderTests
{
    private static AlertRule MakeRule(string conditionJson, string template) =>
        new AlertRule
        {
            Id = Guid.NewGuid(),
            SourceId = Guid.NewGuid(),
            Name = "Test Rule",
            Condition = JsonDocument.Parse(conditionJson),
            MessageTpl = template,
            Channel = "telegram",
            IsActive = true
        };

    private static AlertMatch MakeMatch(
        AlertRule rule,
        DiffResult diff,
        JsonDocument payload,
        string conditionType) =>
        new AlertMatch(rule, diff, payload, conditionType);

    private static DiffResult EmptyDiff() =>
        new DiffResult(IsNewEntry: false, ChangedFields: new Dictionary<string, FieldChange>());

    [Fact]
    public void NewItem_SubstitutesTemplateTokens()
    {
        var rule = MakeRule("""{"type":"new_item"}""", "New event: {event_name}");
        var payload = JsonDocument.Parse("""{"event_name":"Windblume"}""");
        var match = MakeMatch(rule, new DiffResult(true, new Dictionary<string, FieldChange>()), payload, "new_item");

        var result = MessageBuilder.BuildMessage(match);

        Assert.Equal("New event: Windblume", result);
    }

    [Fact]
    public void NewItem_NoAutoAppend()
    {
        var rule = MakeRule("""{"type":"new_item"}""", "New item appeared");
        var payload = JsonDocument.Parse("""{"name":"Arsenal"}""");
        var match = MakeMatch(rule, new DiffResult(true, new Dictionary<string, FieldChange>()), payload, "new_item");

        var result = MessageBuilder.BuildMessage(match);

        // new_item should NOT append any change context
        Assert.Equal("New item appeared", result);
        Assert.DoesNotContain("\n", result!);
    }

    [Fact]
    public void FieldChanged_AppendsOldNewValues()
    {
        var rule = MakeRule("""{"type":"field_changed","field":"points"}""", "EPL update: {home_team}");
        var oldEl = JsonDocument.Parse("72").RootElement;
        var newEl = JsonDocument.Parse("75").RootElement;
        var changedFields = new Dictionary<string, FieldChange>
        {
            ["points"] = new FieldChange(oldEl, newEl)
        };
        var diff = new DiffResult(IsNewEntry: false, ChangedFields: changedFields);
        var payload = JsonDocument.Parse("""{"home_team":"Arsenal","points":75}""");
        var match = MakeMatch(rule, diff, payload, "field_changed");

        var result = MessageBuilder.BuildMessage(match);

        Assert.NotNull(result);
        Assert.StartsWith("EPL update: Arsenal", result);
        Assert.Contains("\npoints: 72 -> 75", result);
    }

    [Fact]
    public void Threshold_AppendsCurrentValue()
    {
        var rule = MakeRule("""{"type":"threshold","field":"win_rate","operator":">","value":55}""", "Threshold alert: {champion}");
        var payload = JsonDocument.Parse("""{"champion":"Jinx","win_rate":58.2}""");
        var match = MakeMatch(rule, EmptyDiff(), payload, "threshold");

        var result = MessageBuilder.BuildMessage(match);

        Assert.NotNull(result);
        Assert.StartsWith("Threshold alert: Jinx", result);
        Assert.Contains("\nCurrent value: 58.2", result);
    }

    [Fact]
    public void EmptyMessage_ReturnsNull()
    {
        var rule = MakeRule("""{"type":"new_item"}""", "");
        var payload = JsonDocument.Parse("""{}""");
        var match = MakeMatch(rule, new DiffResult(true, new Dictionary<string, FieldChange>()), payload, "new_item");

        var result = MessageBuilder.BuildMessage(match);

        Assert.Null(result);
    }

    [Fact]
    public void MissingTokenInPayload_LeavesTokenAsIs()
    {
        var rule = MakeRule("""{"type":"new_item"}""", "Hello {unknown_field}");
        var payload = JsonDocument.Parse("""{"other_field":"value"}""");
        var match = MakeMatch(rule, new DiffResult(true, new Dictionary<string, FieldChange>()), payload, "new_item");

        var result = MessageBuilder.BuildMessage(match);

        Assert.NotNull(result);
        Assert.Contains("{unknown_field}", result);
    }
}
