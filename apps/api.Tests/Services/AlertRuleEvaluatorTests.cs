using System.Text.Json;
using WebCrawlerApi.Data.Entities;
using WebCrawlerApi.Models.Notifications;
using WebCrawlerApi.Services;

namespace WebCrawlerApi.Tests.Services;

public class AlertRuleEvaluatorTests
{
    private static AlertRule MakeRule(string conditionJson, string name = "Test Rule") =>
        new AlertRule
        {
            Id = Guid.NewGuid(),
            SourceId = Guid.NewGuid(),
            Name = name,
            Condition = JsonDocument.Parse(conditionJson),
            MessageTpl = "Alert: {name}",
            Channel = "telegram",
            IsActive = true
        };

    private static DiffResult NewEntry(params (string field, JsonElement? old, JsonElement @new)[] changes)
    {
        var dict = changes.ToDictionary(
            c => c.field,
            c => new FieldChange(c.old, c.@new));
        return new DiffResult(IsNewEntry: true, ChangedFields: dict);
    }

    private static DiffResult ExistingEntry(params (string field, JsonElement? old, JsonElement @new)[] changes)
    {
        var dict = changes.ToDictionary(
            c => c.field,
            c => new FieldChange(c.old, c.@new));
        return new DiffResult(IsNewEntry: false, ChangedFields: dict);
    }

    [Fact]
    public void NewItem_Fires_WhenIsNewEntry()
    {
        var rule = MakeRule("""{"type":"new_item"}""");
        var diff = NewEntry();
        var payload = JsonDocument.Parse("""{"name":"Test Item"}""");

        var matches = AlertRuleEvaluator.Evaluate(new[] { rule }, diff, payload);

        Assert.Single(matches);
        Assert.Equal("new_item", matches[0].ConditionType);
    }

    [Fact]
    public void NewItem_DoesNotFire_WhenExistingEntry()
    {
        var rule = MakeRule("""{"type":"new_item"}""");
        var diff = ExistingEntry();
        var payload = JsonDocument.Parse("""{"name":"Test Item"}""");

        var matches = AlertRuleEvaluator.Evaluate(new[] { rule }, diff, payload);

        Assert.Empty(matches);
    }

    [Fact]
    public void FieldChanged_Fires_WhenTrackedFieldChanged()
    {
        var rule = MakeRule("""{"type":"field_changed","field":"points"}""");
        var oldEl = JsonDocument.Parse("72").RootElement;
        var newEl = JsonDocument.Parse("75").RootElement;
        var diff = ExistingEntry(("points", oldEl, newEl));
        var payload = JsonDocument.Parse("""{"name":"Arsenal","points":75}""");

        var matches = AlertRuleEvaluator.Evaluate(new[] { rule }, diff, payload);

        Assert.Single(matches);
        Assert.Equal("field_changed", matches[0].ConditionType);
    }

    [Fact]
    public void FieldChanged_DoesNotFire_WhenOtherFieldChanged()
    {
        var rule = MakeRule("""{"type":"field_changed","field":"points"}""");
        var oldEl = JsonDocument.Parse("""  "Arsenal"  """).RootElement;
        var newEl = JsonDocument.Parse("""  "Liverpool"  """).RootElement;
        var diff = ExistingEntry(("name", oldEl, newEl));
        var payload = JsonDocument.Parse("""{"name":"Liverpool","points":72}""");

        var matches = AlertRuleEvaluator.Evaluate(new[] { rule }, diff, payload);

        Assert.Empty(matches);
    }

    [Fact]
    public void Threshold_GT_Fires_WhenValueExceeds()
    {
        var rule = MakeRule("""{"type":"threshold","field":"win_rate","operator":">","value":55}""");
        var diff = ExistingEntry();
        var payload = JsonDocument.Parse("""{"win_rate":58.2}""");

        var matches = AlertRuleEvaluator.Evaluate(new[] { rule }, diff, payload);

        Assert.Single(matches);
        Assert.Equal("threshold", matches[0].ConditionType);
    }

    [Fact]
    public void Threshold_GT_DoesNotFire_WhenBelow()
    {
        var rule = MakeRule("""{"type":"threshold","field":"win_rate","operator":">","value":55}""");
        var diff = ExistingEntry();
        var payload = JsonDocument.Parse("""{"win_rate":50.0}""");

        var matches = AlertRuleEvaluator.Evaluate(new[] { rule }, diff, payload);

        Assert.Empty(matches);
    }

    [Fact]
    public void Threshold_LT_Fires()
    {
        var rule = MakeRule("""{"type":"threshold","field":"score","operator":"<","value":10}""");
        var diff = ExistingEntry();
        var payload = JsonDocument.Parse("""{"score":5}""");

        var matches = AlertRuleEvaluator.Evaluate(new[] { rule }, diff, payload);

        Assert.Single(matches);
        Assert.Equal("threshold", matches[0].ConditionType);
    }

    [Fact]
    public void MultipleRules_OnlyMatchingOnesReturned()
    {
        // Rule 1: new_item (should NOT fire - existing entry)
        var rule1 = MakeRule("""{"type":"new_item"}""", "New Item Rule");
        // Rule 2: field_changed "points" (should fire)
        var rule2 = MakeRule("""{"type":"field_changed","field":"points"}""", "Points Changed Rule");
        // Rule 3: threshold win_rate > 55 (should NOT fire - value below threshold)
        var rule3 = MakeRule("""{"type":"threshold","field":"win_rate","operator":">","value":55}""", "Win Rate Rule");

        var oldEl = JsonDocument.Parse("72").RootElement;
        var newEl = JsonDocument.Parse("75").RootElement;
        var diff = ExistingEntry(("points", oldEl, newEl));
        var payload = JsonDocument.Parse("""{"name":"Arsenal","points":75,"win_rate":50.0}""");

        var matches = AlertRuleEvaluator.Evaluate(new[] { rule1, rule2, rule3 }, diff, payload);

        Assert.Single(matches);
        Assert.Equal("field_changed", matches[0].ConditionType);
    }
}
