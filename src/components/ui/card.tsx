export function Card({
  children,
  className = "",
  id
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`min-w-0 rounded-xl border border-line bg-card shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  description,
  action,
  compact = false
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-2 px-4 md:flex-row md:items-center md:justify-between ${compact ? "py-2" : "py-4"}`}>
      <div>
        <h2 className={`${compact ? "text-base" : "text-lg"} font-semibold text-ink`}>{title}</h2>
        {description ? <p className={`${compact ? "mt-0 text-xs" : "mt-1 text-sm"} text-muted`}>{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
