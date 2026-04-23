using WebCrawlerApi.Hubs;
using WebCrawlerApi.Services;

namespace WebCrawlerApi.Tests.Hubs;

public class DashboardHubTests
{
    [Fact]
    public async Task OnConnectedAsync_IncrementsTracker()
    {
        var tracker = new HubConnectionTracker();
        var hub = new DashboardHub(tracker);

        await hub.OnConnectedAsync();

        Assert.Equal(1, tracker.Count);
    }

    [Fact]
    public async Task OnDisconnectedAsync_DecrementsTracker()
    {
        var tracker = new HubConnectionTracker();
        tracker.Increment();
        var hub = new DashboardHub(tracker);

        await hub.OnDisconnectedAsync(exception: null);

        Assert.Equal(0, tracker.Count);
    }

    [Fact]
    public async Task OnConnected_ThenOnDisconnected_ReturnsToZero()
    {
        var tracker = new HubConnectionTracker();
        var hub = new DashboardHub(tracker);

        await hub.OnConnectedAsync();
        await hub.OnDisconnectedAsync(exception: null);

        Assert.Equal(0, tracker.Count);
    }
}
