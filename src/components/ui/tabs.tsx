import Link from "next/link";

export function Tabs({
  items
}: {
  items: {
    href: string;
    label: string;
    active: boolean;
    onClick?: () => void;
  }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-1 text-sm font-semibold shadow-sm">
      {items.map((item) => {
        const className = `rounded-lg px-3 py-2 transition ${
          item.active ? "bg-brand text-white" : "text-muted hover:bg-slate-50 hover:text-ink"
        }`;

        return item.onClick ? (
          <button key={item.href} type="button" onClick={item.onClick} className={className}>
            {item.label}
          </button>
        ) : (
          <Link key={item.href} href={item.href} className={className}>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
