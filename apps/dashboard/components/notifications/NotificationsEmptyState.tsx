export function NotificationsEmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 gap-4">
      <h2 className="text-xl font-semibold text-zinc-900">No notifications sent yet</h2>
      <p className="text-sm text-zinc-600 max-w-md">
        Notifications will appear here once alert rules are triggered.
      </p>
    </div>
  );
}
