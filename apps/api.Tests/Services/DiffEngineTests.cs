using System.Text.Json;
using WebCrawlerApi.Models.Notifications;
using WebCrawlerApi.Services;

namespace WebCrawlerApi.Tests.Services;

public class DiffEngineTests
{
    [Fact]
    public void Compare_NullOldPayload_ReturnsIsNewEntryTrue()
    {
        var newDoc = JsonDocument.Parse("""{"name":"Arsenal","points":75}""");
        var result = DiffEngine.Compare(null, newDoc);
        Assert.True(result.IsNewEntry);
        Assert.Equal(2, result.ChangedFields.Count);
        Assert.True(result.ChangedFields.ContainsKey("name"));
        Assert.True(result.ChangedFields.ContainsKey("points"));
    }

    [Fact]
    public void Compare_IdenticalPayloads_ReturnsEmptyChanges()
    {
        var old = JsonDocument.Parse("""{"name":"Arsenal","points":75}""");
        var newDoc = JsonDocument.Parse("""{"name":"Arsenal","points":75}""");
        var result = DiffEngine.Compare(old, newDoc);
        Assert.False(result.IsNewEntry);
        Assert.Empty(result.ChangedFields);
    }

    [Fact]
    public void Compare_FieldChanged_ReturnsChangedField()
    {
        var old = JsonDocument.Parse("""{"name":"Arsenal","points":72}""");
        var newDoc = JsonDocument.Parse("""{"name":"Arsenal","points":75}""");
        var result = DiffEngine.Compare(old, newDoc);
        Assert.False(result.IsNewEntry);
        Assert.Single(result.ChangedFields);
        Assert.True(result.ChangedFields.ContainsKey("points"));
        Assert.Equal(72, result.ChangedFields["points"].OldValue!.Value.GetInt32());
        Assert.Equal(75, result.ChangedFields["points"].NewValue.GetInt32());
    }

    [Fact]
    public void Compare_NewFieldAdded_ReturnsFieldWithNullOld()
    {
        var old = JsonDocument.Parse("""{"name":"Arsenal"}""");
        var newDoc = JsonDocument.Parse("""{"name":"Arsenal","points":75}""");
        var result = DiffEngine.Compare(old, newDoc);
        Assert.Single(result.ChangedFields);
        Assert.True(result.ChangedFields.ContainsKey("points"));
        Assert.Null(result.ChangedFields["points"].OldValue);
    }

    [Fact]
    public void Compare_BooleanFieldChanged_Detected()
    {
        var old = JsonDocument.Parse("""{"is_active":true}""");
        var newDoc = JsonDocument.Parse("""{"is_active":false}""");
        var result = DiffEngine.Compare(old, newDoc);
        Assert.Single(result.ChangedFields);
        Assert.True(result.ChangedFields.ContainsKey("is_active"));
    }
}
