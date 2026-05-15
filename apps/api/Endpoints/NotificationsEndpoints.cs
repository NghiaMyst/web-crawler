using Microsoft.EntityFrameworkCore;
using WebCrawlerApi.Data;

namespace WebCrawlerApi.Endpoints;

public static class NotificationsEndpoints
{
    public static RouteGroupBuilder MapNotificationsEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/", GetNotifications);
        return group;
    }

    internal static async Task<IResult> GetNotifications(
        AppDbContext db,
        Guid? sourceId = null,
        int limit = 100)
    {
        var query = db.NotificationLogs
            .AsNoTracking()
            .Include(n => n.AlertRule)
                .ThenInclude(r => r.Source)
            .AsQueryable();

        if (sourceId.HasValue)
            query = query.Where(n => n.AlertRule.SourceId == sourceId.Value);

        var rows = await query
            .OrderByDescending(n => n.SentAt)
            .Take(limit)
            .Select(n => new
            {
                n.Id,
                n.AlertRuleId,
                AlertRuleName = n.AlertRule.Name,
                SourceId = n.AlertRule.SourceId,
                SourceName = n.AlertRule.Source.DisplayName,
                n.Channel,
                n.Message,
                n.Status,
                n.SentAt,
            })
            .ToListAsync();

        return Results.Ok(rows);
    }
}
