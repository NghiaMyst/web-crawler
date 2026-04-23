using Microsoft.AspNetCore.SignalR;
using WebCrawlerApi.Services;

namespace WebCrawlerApi.Hubs;

/// <summary>
/// SignalR hub at /hubs/dashboard. Server-to-client only — no client-invokable methods.
/// Connection lifecycle increments/decrements HubConnectionTracker per D-06.
/// Broadcast is driven from CrawlerEventListener via IHubContext<DashboardHub> in Plan 06-02
/// (hub instances are transient — never inject DashboardHub directly; see RESEARCH Pitfall 3).
/// </summary>
public class DashboardHub(HubConnectionTracker tracker) : Hub
{
    public override async Task OnConnectedAsync()
    {
        tracker.Increment();
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        tracker.Decrement();
        await base.OnDisconnectedAsync(exception);
    }
}
