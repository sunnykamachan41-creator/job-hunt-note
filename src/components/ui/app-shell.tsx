"use client";

import Link from "next/link";

export type NavKey = "dashboard" | "calendar" | "companies" | "analytics" | "settings";
type AddMode = "company" | "event";

const navItems: { key: NavKey; icon: string; label: string; href: string }[] = [
  { key: "dashboard", icon: "🏠", label: "ダッシュボード", href: "/" },
  { key: "calendar", icon: "📅", label: "カレンダー", href: "/?view=calendar" },
  { key: "companies", icon: "🏢", label: "企業", href: "/?view=companies" },
  { key: "analytics", icon: "📊", label: "統計", href: "/?view=stats" },
  { key: "settings", icon: "⚙️", label: "設定", href: "/?view=settings" }
];

export function AppShell({
  active = "dashboard",
  children,
  rightPanel,
  rightPanelWidthClass = "w-[460px]",
  rightPanelOffsetClass = "lg:mr-[460px]",
  hideAddButton = false,
  persistentNavParams,
  onNavigate,
  addLinks = [
    { mode: "company", label: "企業を追加" },
    { mode: "event", label: "予定を追加" }
  ]
}: {
  active?: NavKey;
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  rightPanelWidthClass?: string;
  rightPanelOffsetClass?: string;
  hideAddButton?: boolean;
  persistentNavParams?: Record<string, string | undefined>;
  onNavigate?: (key: NavKey) => void;
  addLinks?: { href?: string; label: string; mode?: AddMode }[];
}) {
  const fitScreen = active === "dashboard" || active === "calendar";
  const desktopRightMargin = rightPanel ? rightPanelOffsetClass : "";

  return (
    <div className="h-screen w-full overflow-hidden bg-mist text-ink">
      <aside className="fixed bottom-0 left-0 top-0 z-30 hidden w-[260px] border-r border-line bg-card px-4 py-6 lg:block">
        <Link href="/" className="block">
          <p className="text-lg font-bold text-ink">就活ノート</p>
          <p className="mt-1 text-xs text-subtle">Job Hunt OS</p>
        </Link>
        <nav className="mt-8 grid gap-2">
          {navItems.map((item) => {
            const className = `rounded-lg px-3 py-3 text-left text-sm font-semibold transition ${
                active === item.key
                  ? "bg-blue-100 text-brand"
                  : "text-muted hover:bg-slate-50 hover:text-ink"
              }`;
            const content = (
              <>
                <span className="mr-2" aria-hidden="true">{item.icon}</span>
                {item.label}
              </>
            );

            return onNavigate ? (
              <button key={item.key} type="button" onClick={() => onNavigate(item.key)} className={className}>
                {content}
              </button>
            ) : (
              <Link
                key={item.key}
                href={withPersistentParams(item.href, persistentNavParams)}
                className={className}
              >
                {content}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-6 left-4 right-4">
          <button
            type="button"
            onClick={() => openAdd("event")}
            className="flex h-10 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            予定を追加
          </button>
        </div>
      </aside>

      <main
        className={`min-w-0 max-w-full px-4 pt-5 md:px-6 lg:ml-[260px] ${
          fitScreen
            ? "h-screen overflow-hidden pb-4 md:py-4"
            : "h-screen overflow-y-auto overflow-x-hidden pb-28 md:py-6"
        } ${desktopRightMargin}`}
      >
        {children}
      </main>

      {rightPanel ? (
        <aside className={`fixed bottom-0 right-0 top-0 hidden border-l border-line bg-white px-4 py-6 shadow-[-12px_0_32px_rgba(15,23,42,0.06)] lg:block ${rightPanelWidthClass}`}>
          <div className="h-full overflow-y-auto">{rightPanel}</div>
        </aside>
      ) : null}

      <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-line bg-card px-2 py-2 shadow-sm lg:hidden">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onNavigate?.(item.key)}
            className={`rounded-lg px-2 py-2 text-center text-xs font-semibold ${
              active === item.key ? "bg-blue-100 text-brand" : "text-muted"
            }`}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span className="mt-1 block">{item.label}</span>
          </button>
        ))}
      </nav>

      {hideAddButton ? null : (
        <details className="fixed bottom-20 right-4 z-50 lg:bottom-6 lg:right-6">
          <summary className="flex h-14 w-14 list-none items-center justify-center rounded-full bg-brand text-2xl font-semibold leading-none text-white shadow-md transition hover:bg-blue-700">
            +
          </summary>
          <div className="absolute bottom-16 right-0 grid w-40 gap-2 rounded-xl border border-line bg-card p-2 shadow-sm">
            {addLinks.map((link) => {
              const mode = link.mode;

              return mode !== undefined ? (
                <button
                  key={`${mode}-${link.label}`}
                  type="button"
                  onClick={() => openAdd(mode)}
                  className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-slate-50"
                >
                  {link.label}
                </button>
              ) : (
                <Link
                key={`${link.href}-${link.label}`}
                href={link.href ?? "/"}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
              >
                {link.label}
              </Link>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function openAdd(mode: AddMode) {
  window.dispatchEvent(new CustomEvent("job-hunt-note:add", { detail: mode }));
}

function withPersistentParams(href: string, params?: Record<string, string | undefined>) {
  if (!params) return href;

  const [path, query = ""] = href.split("?");
  const search = new URLSearchParams(query);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
}
