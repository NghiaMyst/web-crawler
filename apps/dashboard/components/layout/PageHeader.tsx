interface PageHeaderProps {
  title: string;
  description?: string;
}

/**
 * Consistent page-level heading used across all dashboard pages.
 * Title in bold with optional muted description line.
 */
export function PageHeader({ title, description }: PageHeaderProps): React.JSX.Element {
  return (
    <div className="mb-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
