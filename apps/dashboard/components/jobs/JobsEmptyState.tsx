export function JobsEmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 gap-4">
      <h2 className="text-xl font-semibold text-zinc-900">No jobs found</h2>
      <p className="text-sm text-zinc-600 max-w-md">
        Crawl jobs will appear here once sources begin crawling.
      </p>
    </div>
  );
}
