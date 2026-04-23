using WebCrawlerApi.Services;

namespace WebCrawlerApi.Tests.Services;

public class HubConnectionTrackerTests
{
    [Fact]
    public void Count_StartsAtZero()
    {
        var tracker = new HubConnectionTracker();
        Assert.Equal(0, tracker.Count);
    }

    [Fact]
    public void Increment_IncreasesCount()
    {
        var tracker = new HubConnectionTracker();
        tracker.Increment();
        tracker.Increment();
        tracker.Increment();
        Assert.Equal(3, tracker.Count);
    }

    [Fact]
    public void Decrement_DecreasesCount()
    {
        var tracker = new HubConnectionTracker();
        tracker.Increment();
        tracker.Decrement();
        Assert.Equal(0, tracker.Count);
    }

    [Fact]
    public void Decrement_GoesNegativeIfOverDecremented()
    {
        var tracker = new HubConnectionTracker();
        tracker.Decrement();
        Assert.Equal(-1, tracker.Count);
    }

    [Fact]
    public void Increment_IsThreadSafe_Under1000ParallelCalls()
    {
        var tracker = new HubConnectionTracker();
        Parallel.For(0, 1000, _ => tracker.Increment());
        Assert.Equal(1000, tracker.Count);
    }
}
