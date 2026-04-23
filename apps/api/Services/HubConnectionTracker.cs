namespace WebCrawlerApi.Services;

/// <summary>
/// Thread-safe counter tracking live SignalR hub connections.
/// Registered as a singleton so both DashboardHub (Hubs/) and the /health endpoint
/// observe the same running total. Uses Interlocked for lock-free correctness
/// (see RESEARCH Pattern 2 / "Don't Hand-Roll" row 3).
/// </summary>
public class HubConnectionTracker
{
    private int _count;

    public void Increment() => Interlocked.Increment(ref _count);

    public void Decrement() => Interlocked.Decrement(ref _count);

    public int Count => Volatile.Read(ref _count);
}
