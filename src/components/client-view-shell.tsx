"use client";

import { useEffect, useMemo, useState } from "react";

import { AppShell, type NavKey } from "@/components/ui/app-shell";
import { Tabs } from "@/components/ui/tabs";

export type ClientAppView = "dashboard" | "calendar" | "companies" | "stats" | "settings";

type ViewNode = {
  title: string;
  description: string;
  content: React.ReactNode;
};

export function ClientViewShell({
  initialView = "dashboard",
  views,
  notices,
  overlays,
  rightPanel,
  persistentNavParams
}: {
  initialView?: ClientAppView;
  views: Record<ClientAppView, ViewNode>;
  notices?: React.ReactNode;
  overlays?: React.ReactNode;
  rightPanel?: React.ReactNode;
  persistentNavParams?: Record<string, string | undefined>;
}) {
  const [activeView, setActiveView] = useState<ClientAppView>(initialView);
  const [mountedViews, setMountedViews] = useState<Set<ClientAppView>>(() => new Set([initialView]));
  const navKey = viewToNavKey(activeView);
  const fitScreen = activeView === "dashboard" || activeView === "calendar";
  const addLinks = useMemo(
    () => [
      { label: "企業を追加", mode: "company" as const },
      { label: "予定を追加", mode: "event" as const }
    ],
    []
  );

  useEffect(() => {
    setMountedViews((current) => {
      if (current.has(activeView)) return current;
      const nextViews = new Set(current);
      nextViews.add(activeView);
      return nextViews;
    });
  }, [activeView]);

  useEffect(() => {
    function onOpenCompanyKarte() {
      openView("companies", setActiveView, setMountedViews);
    }

    window.addEventListener("job-hunt-note:company-karte-open", onOpenCompanyKarte);
    return () => window.removeEventListener("job-hunt-note:company-karte-open", onOpenCompanyKarte);
  }, []);

  return (
    <AppShell
      active={navKey}
      onNavigate={(next) => openView(navKeyToView(next), setActiveView, setMountedViews)}
      rightPanel={rightPanel}
      rightPanelWidthClass="w-[460px]"
      rightPanelOffsetClass="lg:mr-[460px]"
      persistentNavParams={persistentNavParams}
      addLinks={addLinks}
    >
      <div className={`grid min-w-0 max-w-full ${
        activeView === "dashboard"
          ? "h-full grid-rows-[minmax(0,1fr)] gap-3 overflow-hidden"
          : activeView === "calendar"
            ? "h-full overflow-hidden"
            : "gap-6"
      }`}>
        {fitScreen ? null : (
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold text-brand">Job Hunt Note</p>
              <h1 className="mt-1 text-2xl font-bold text-ink">{views[activeView].title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                {views[activeView].description}
              </p>
            </div>
            <Tabs
              items={[
                { href: "#dashboard", label: "ダッシュボード", active: navKey === "dashboard", onClick: () => setActiveView("dashboard") },
                { href: "#calendar", label: "カレンダー", active: navKey === "calendar", onClick: () => setActiveView("calendar") },
                { href: "#companies", label: "企業", active: navKey === "companies", onClick: () => setActiveView("companies") },
                { href: "#stats", label: "統計", active: navKey === "analytics", onClick: () => setActiveView("stats") },
                { href: "#settings", label: "設定", active: navKey === "settings", onClick: () => setActiveView("settings") }
              ]}
            />
          </header>
        )}

        {notices}

        {(Object.keys(views) as ClientAppView[]).filter((view) => mountedViews.has(view)).map((view) => (
          <section key={view} className={view === activeView ? "contents" : "hidden"} aria-hidden={view !== activeView}>
            {views[view].content}
          </section>
        ))}

        {overlays}
      </div>
    </AppShell>
  );
}

function viewToNavKey(view: ClientAppView): NavKey {
  if (view === "stats") return "analytics";
  return view;
}

function navKeyToView(key: NavKey): ClientAppView {
  if (key === "analytics") return "stats";
  return key;
}

function openView(
  view: ClientAppView,
  setActiveView: React.Dispatch<React.SetStateAction<ClientAppView>>,
  setMountedViews: React.Dispatch<React.SetStateAction<Set<ClientAppView>>>
) {
  setActiveView(view);
  setMountedViews((current) => {
    if (current.has(view)) return current;
    const nextViews = new Set(current);
    nextViews.add(view);
    return nextViews;
  });
}
