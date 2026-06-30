"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import type { SheetRow } from "@/lib/google-sheets";
import type { Company } from "@/types/company";

export const localEventDraftsKey = "job-hunt-note.localEventDrafts";
export const localCompanyDraftsKey = "job-hunt-note.localCompanyDrafts";
export const localEventUpdatesKey = "job-hunt-note.localEventUpdates";
export const localCompanyUpdatesKey = "job-hunt-note.localCompanyUpdates";
export const localEventDeletesKey = "job-hunt-note.localEventDeletes";
export const localCompanyDeletesKey = "job-hunt-note.localCompanyDeletes";
const localDraftsChangedEvent = "job-hunt-note.localDraftsChanged";
export const localDraftsSyncedEvent = "job-hunt-note.localDraftsSynced";

export type LocalEventDraft = {
  draft_id: string;
  company_id: string;
  selection_type: string;
  event_type: string;
  title: string;
  start_datetime: string;
  end_datetime: string;
  is_period: string;
  period_end_date: string;
  event_series_id: string;
  series_day_index: string;
  time_mode: string;
  status: string;
  person: string;
  meeting_url: string;
  memo: string;
  sync_to_calendar: string;
  timezone: string;
  created_at: string;
  synced_at?: string;
};

export type LocalCompanyDraft = {
  draft_id: string;
  company_id: string;
  company_name: string;
  industry: string;
  status: string;
  mypage_url: string;
  memo: string;
  application_source: string;
  created_at: string;
  synced_at?: string;
};

export type LocalEventUpdateDraft = LocalEventDraft & {
  event_id: string;
};

export type LocalCompanyUpdateDraft = LocalCompanyDraft & {
  company_id: string;
};

export type LocalEventDeleteDraft = {
  event_id: string;
  label: string;
  created_at: string;
  synced_at?: string;
};

export type LocalCompanyDeleteDraft = {
  company_id: string;
  label: string;
  created_at: string;
  synced_at?: string;
};

export function saveLocalEventDraft(draft: LocalEventDraft) {
  saveLocalEventDrafts([draft]);
}

export function saveLocalEventDrafts(nextDrafts: LocalEventDraft[]) {
  if (!nextDrafts.length) return;
  const draftIds = new Set(nextDrafts.map((draft) => draft.draft_id));
  const drafts = readLocalEventDrafts().filter((item) => !draftIds.has(item.draft_id));
  window.localStorage.setItem(localEventDraftsKey, JSON.stringify([...nextDrafts, ...drafts]));
  window.dispatchEvent(new Event(localDraftsChangedEvent));
}

export function saveLocalCompanyDraft(draft: LocalCompanyDraft) {
  const drafts = readLocalCompanyDrafts().filter((item) => item.company_id !== draft.company_id && item.draft_id !== draft.draft_id);
  window.localStorage.setItem(localCompanyDraftsKey, JSON.stringify([draft, ...drafts]));
  window.dispatchEvent(new Event(localDraftsChangedEvent));
}

export function saveLocalEventUpdate(draft: LocalEventUpdateDraft) {
  saveLocalEventUpdates([draft]);
}

export function saveLocalEventUpdates(nextDrafts: LocalEventUpdateDraft[]) {
  if (!nextDrafts.length) return;
  const eventIds = new Set(nextDrafts.map((draft) => draft.event_id));
  const drafts = readLocalEventUpdates().filter((item) => !eventIds.has(item.event_id));
  window.localStorage.setItem(localEventUpdatesKey, JSON.stringify([...nextDrafts, ...drafts]));
  window.dispatchEvent(new Event(localDraftsChangedEvent));
}

export function saveLocalCompanyUpdate(draft: LocalCompanyUpdateDraft) {
  const drafts = readLocalCompanyUpdates().filter((item) => item.company_id !== draft.company_id);
  window.localStorage.setItem(localCompanyUpdatesKey, JSON.stringify([draft, ...drafts]));
  window.dispatchEvent(new Event(localDraftsChangedEvent));
}

export function saveLocalEventDelete(draft: LocalEventDeleteDraft) {
  saveLocalEventDeletes([draft]);
}

export function saveLocalEventDeletes(drafts: LocalEventDeleteDraft[]) {
  if (!drafts.length) return;
  const draftIds = new Set(drafts.map((draft) => draft.event_id));
  const currentEventDrafts = readLocalEventDrafts();
  const removedLocalDraftIds = new Set(currentEventDrafts.filter((item) => draftIds.has(item.draft_id)).map((item) => item.draft_id));
  const eventDrafts = currentEventDrafts.filter((item) => !draftIds.has(item.draft_id));
  const eventUpdates = readLocalEventUpdates().filter((item) => !draftIds.has(item.event_id));
  const deletes = readLocalEventDeletes().filter((item) => !draftIds.has(item.event_id));
  const queuedDeletes = drafts.filter((draft) => !removedLocalDraftIds.has(draft.event_id));
  window.localStorage.setItem(localEventDraftsKey, JSON.stringify(eventDrafts));
  window.localStorage.setItem(localEventUpdatesKey, JSON.stringify(eventUpdates));
  window.localStorage.setItem(localEventDeletesKey, JSON.stringify([...queuedDeletes, ...deletes]));
  window.dispatchEvent(new Event(localDraftsChangedEvent));
}

export function saveLocalCompanyDelete(draft: LocalCompanyDeleteDraft) {
  const currentCompanyDrafts = readLocalCompanyDrafts();
  const removedLocalDraft = currentCompanyDrafts.some((item) => item.company_id === draft.company_id);
  const companyDrafts = currentCompanyDrafts.filter((item) => item.company_id !== draft.company_id);
  const companyUpdates = readLocalCompanyUpdates().filter((item) => item.company_id !== draft.company_id);
  const deletes = readLocalCompanyDeletes().filter((item) => item.company_id !== draft.company_id);
  window.localStorage.setItem(localCompanyDraftsKey, JSON.stringify(companyDrafts));
  window.localStorage.setItem(localCompanyUpdatesKey, JSON.stringify(companyUpdates));
  window.localStorage.setItem(localCompanyDeletesKey, JSON.stringify(removedLocalDraft ? deletes : [draft, ...deletes]));
  window.dispatchEvent(new Event(localDraftsChangedEvent));
}

export function useLocalEventDrafts() {
  return useLocalDraftList(readLocalEventDrafts);
}

export function useLocalCompanyDrafts() {
  return useLocalDraftList(readLocalCompanyDrafts);
}

export function useLocalEventUpdates() {
  return useLocalDraftList(readLocalEventUpdates);
}

export function useLocalCompanyUpdates() {
  return useLocalDraftList(readLocalCompanyUpdates);
}

export function useLocalEventDeletes() {
  return useLocalDraftList(readLocalEventDeletes);
}

export function useLocalCompanyDeletes() {
  return useLocalDraftList(readLocalCompanyDeletes);
}

function useLocalDraftList<T>(read: () => T[]) {
  const [drafts, setDrafts] = useState<T[]>([]);

  useEffect(() => {
    function refresh() {
      setDrafts(read());
    }

    refresh();
    window.addEventListener(localDraftsChangedEvent, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(localDraftsChangedEvent, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [read]);

  return drafts;
}

export function LocalDraftSyncPanel({ companies }: { companies: SheetRow<Company>[] }) {
  const eventDrafts = useLocalEventDrafts();
  const companyDrafts = useLocalCompanyDrafts();
  const eventUpdates = useLocalEventUpdates();
  const companyUpdates = useLocalCompanyUpdates();
  const eventDeletes = useLocalEventDeletes();
  const companyDeletes = useLocalCompanyDeletes();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, startSync] = useTransition();
  const companyNames = useMemo(
    () => new Map([
      ...companies.map((company) => [company.company_id, company.company_name] as const),
      ...companyDrafts.map((company) => [company.company_id, `${company.company_name}（未同期）`] as const)
    ]),
    [companies, companyDrafts]
  );
  const pendingEventDrafts = eventDrafts.filter((draft) => !draft.synced_at);
  const pendingCompanyDrafts = companyDrafts.filter((draft) => !draft.synced_at);
  const pendingEventUpdates = eventUpdates.filter((draft) => !draft.synced_at);
  const pendingCompanyUpdates = companyUpdates.filter((draft) => !draft.synced_at);
  const pendingEventDeletes = eventDeletes.filter((draft) => !draft.synced_at);
  const pendingCompanyDeletes = companyDeletes.filter((draft) => !draft.synced_at);
  const totalDrafts = pendingEventDrafts.length + pendingCompanyDrafts.length + pendingEventUpdates.length + pendingCompanyUpdates.length + pendingEventDeletes.length + pendingCompanyDeletes.length;

  function sync(
    nextCompanyDrafts = pendingCompanyDrafts,
    nextEventDrafts = pendingEventDrafts,
    nextCompanyUpdates = pendingCompanyUpdates,
    nextEventUpdates = pendingEventUpdates,
    nextCompanyDeletes = pendingCompanyDeletes,
    nextEventDeletes = pendingEventDeletes
  ) {
    if (isSyncing) return;
    setSyncError(null);

    startSync(async () => {
      const response = await fetch("/api/local-drafts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companies: nextCompanyDrafts,
          events: nextEventDrafts,
          companyUpdates: nextCompanyUpdates,
          eventUpdates: nextEventUpdates,
          companyDeletes: nextCompanyDeletes,
          eventDeletes: nextEventDeletes
        })
      });
      const result = await response.json() as { ok: true } | { ok: false; error: string };
      if (!result.ok) {
        setSyncError(result.error);
        return;
      }

      markDraftsSynced(nextCompanyDrafts, nextEventDrafts, nextCompanyUpdates, nextEventUpdates, nextCompanyDeletes, nextEventDeletes);
    });
  }

  if (!totalDrafts) {
    return null;
  }

  return (
    <>
    <aside className="fixed bottom-24 left-4 right-4 z-[70] flex max-h-[300px] flex-col rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-xl lg:bottom-20 lg:left-4 lg:right-auto lg:w-[232px] lg:max-h-[320px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-amber-900">未同期の変更 {totalDrafts}件</p>
          <p className="mt-1 text-xs font-semibold text-amber-800">ローカル保存中です。Sheetsへ反映するには同期してください。</p>
        </div>
        <button
          type="button"
          onClick={() => {
            window.localStorage.removeItem(localEventDraftsKey);
            window.localStorage.removeItem(localCompanyDraftsKey);
            window.localStorage.removeItem(localEventUpdatesKey);
            window.localStorage.removeItem(localCompanyUpdatesKey);
            window.localStorage.removeItem(localEventDeletesKey);
            window.localStorage.removeItem(localCompanyDeletesKey);
            window.dispatchEvent(new Event(localDraftsChangedEvent));
          }}
          className="rounded-lg px-2 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100"
        >
          破棄
        </button>
      </div>
      <div className="mt-3 grid gap-2 border-t border-amber-200 pt-3">
        <button
          type="button"
          className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-brand bg-brand px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          onClick={() => sync()}
          disabled={isSyncing}
        >
          {isSyncing ? "同期中..." : "まとめて同期"}
        </button>
        <span className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-xs font-bold text-amber-800">
          新規 {pendingCompanyDrafts.length + pendingEventDrafts.length} / 編集 {pendingCompanyUpdates.length + pendingEventUpdates.length} / 削除 {pendingCompanyDeletes.length + pendingEventDeletes.length}
        </span>
        {syncError ? <p className="text-xs font-semibold text-red-700">{syncError}</p> : null}
      </div>
      <div className="mt-3 grid min-h-0 gap-2 overflow-y-auto pr-1">
        {pendingCompanyDrafts.slice(0, 4).map((draft) => (
          <div
            key={draft.draft_id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-amber-200 bg-white p-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{draft.company_name || "企業名未設定"}</p>
              <p className="truncate text-xs font-semibold text-muted">企業追加 / 未同期</p>
            </div>
            <button type="button" onClick={() => sync([draft], [], [], [], [], [])} disabled={isSyncing} className="inline-flex h-9 items-center justify-center rounded-lg border border-brand bg-brand px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">同期</button>
          </div>
        ))}
        {pendingEventDrafts.slice(0, Math.max(0, 4 - pendingCompanyDrafts.length)).map((draft) => {
          const waitsForCompany = pendingCompanyDrafts.some((company) => company.company_id === draft.company_id);

          return (
            <div
              key={draft.draft_id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-amber-200 bg-white p-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">
                  {draft.event_type || "予定"} / {companyNames.get(draft.company_id) ?? "企業未設定"}
                </p>
                <p className="truncate text-xs font-semibold text-muted">
                  {waitsForCompany ? "先に企業を同期してください" : draft.start_datetime || "日付未設定"}
                </p>
              </div>
              <button type="button" onClick={() => sync([], [draft], [], [], [], [])} disabled={waitsForCompany || isSyncing} className="inline-flex h-9 items-center justify-center rounded-lg border border-brand bg-brand px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">同期</button>
            </div>
          );
        })}
        {pendingCompanyUpdates.slice(0, 4).map((draft) => (
          <div key={`company-update-${draft.company_id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-amber-200 bg-white p-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{draft.company_name || "企業名未設定"}</p>
              <p className="truncate text-xs font-semibold text-muted">企業編集 / 未同期</p>
            </div>
            <span className="text-xs font-bold text-amber-800">待機中</span>
          </div>
        ))}
        {pendingEventUpdates.slice(0, 4).map((draft) => (
          <div key={`event-update-${draft.event_id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-amber-200 bg-white p-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{draft.event_type || "予定"} / {companyNames.get(draft.company_id) ?? "企業未設定"}</p>
              <p className="truncate text-xs font-semibold text-muted">予定編集 / 未同期</p>
            </div>
            <span className="text-xs font-bold text-amber-800">待機中</span>
          </div>
        ))}
        {pendingCompanyDeletes.slice(0, 4).map((draft) => (
          <div key={`company-delete-${draft.company_id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-amber-200 bg-white p-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{draft.label || "企業"}</p>
              <p className="truncate text-xs font-semibold text-muted">企業削除 / 未同期</p>
            </div>
            <span className="text-xs font-bold text-amber-800">待機中</span>
          </div>
        ))}
        {pendingEventDeletes.slice(0, 4).map((draft) => (
          <div key={`event-delete-${draft.event_id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-amber-200 bg-white p-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{draft.label || "予定"}</p>
              <p className="truncate text-xs font-semibold text-muted">予定削除 / 未同期</p>
            </div>
            <span className="text-xs font-bold text-amber-800">待機中</span>
          </div>
        ))}
      </div>
    </aside>
    </>
  );
}

function readLocalEventDrafts() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(localEventDraftsKey) ?? "[]");
    return Array.isArray(parsed) ? uniqueBy(parsed.filter(isLocalEventDraft), (draft) => draft.draft_id) : [];
  } catch {
    return [];
  }
}

function readLocalCompanyDrafts() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(localCompanyDraftsKey) ?? "[]");
    return Array.isArray(parsed) ? uniqueBy(parsed.filter(isLocalCompanyDraft), (draft) => draft.company_id || draft.draft_id) : [];
  } catch {
    return [];
  }
}

function readLocalEventUpdates() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(localEventUpdatesKey) ?? "[]");
    return Array.isArray(parsed) ? uniqueBy(parsed.filter(isLocalEventUpdateDraft), (draft) => draft.event_id) : [];
  } catch {
    return [];
  }
}

function readLocalCompanyUpdates() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(localCompanyUpdatesKey) ?? "[]");
    return Array.isArray(parsed) ? uniqueBy(parsed.filter(isLocalCompanyUpdateDraft), (draft) => draft.company_id) : [];
  } catch {
    return [];
  }
}

function readLocalEventDeletes() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(localEventDeletesKey) ?? "[]");
    return Array.isArray(parsed) ? uniqueBy(parsed.filter(isLocalEventDeleteDraft), (draft) => draft.event_id) : [];
  } catch {
    return [];
  }
}

function readLocalCompanyDeletes() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(localCompanyDeletesKey) ?? "[]");
    return Array.isArray(parsed) ? uniqueBy(parsed.filter(isLocalCompanyDeleteDraft), (draft) => draft.company_id) : [];
  } catch {
    return [];
  }
}

function markDraftsSynced(
  companyDrafts: LocalCompanyDraft[],
  eventDrafts: LocalEventDraft[],
  companyUpdates: LocalCompanyUpdateDraft[],
  eventUpdates: LocalEventUpdateDraft[],
  companyDeletes: LocalCompanyDeleteDraft[],
  eventDeletes: LocalEventDeleteDraft[]
) {
  const syncedAt = new Date().toISOString();
  const companyDraftIds = new Set(companyDrafts.map((draft) => draft.draft_id));
  const eventDraftIds = new Set(eventDrafts.map((draft) => draft.draft_id));
  const companyUpdateIds = new Set(companyUpdates.map((draft) => draft.company_id));
  const eventUpdateIds = new Set(eventUpdates.map((draft) => draft.event_id));
  const companyDeleteIds = new Set(companyDeletes.map((draft) => draft.company_id));
  const eventDeleteIds = new Set(eventDeletes.map((draft) => draft.event_id));

  if (companyDraftIds.size) {
    window.localStorage.setItem(
      localCompanyDraftsKey,
      JSON.stringify(readLocalCompanyDrafts().map((draft) => companyDraftIds.has(draft.draft_id) ? { ...draft, synced_at: syncedAt } : draft))
    );
  }
  if (eventDraftIds.size) {
    window.localStorage.setItem(
      localEventDraftsKey,
      JSON.stringify(readLocalEventDrafts().map((draft) => eventDraftIds.has(draft.draft_id) ? { ...draft, synced_at: syncedAt } : draft))
    );
  }
  if (companyUpdateIds.size) {
    window.localStorage.setItem(
      localCompanyUpdatesKey,
      JSON.stringify(readLocalCompanyUpdates().map((draft) => companyUpdateIds.has(draft.company_id) ? { ...draft, synced_at: syncedAt } : draft))
    );
  }
  if (eventUpdateIds.size) {
    window.localStorage.setItem(
      localEventUpdatesKey,
      JSON.stringify(readLocalEventUpdates().map((draft) => eventUpdateIds.has(draft.event_id) ? { ...draft, synced_at: syncedAt } : draft))
    );
  }
  if (companyDeleteIds.size) {
    window.localStorage.setItem(
      localCompanyDeletesKey,
      JSON.stringify(readLocalCompanyDeletes().map((draft) => companyDeleteIds.has(draft.company_id) ? { ...draft, synced_at: syncedAt } : draft))
    );
  }
  if (eventDeleteIds.size) {
    window.localStorage.setItem(
      localEventDeletesKey,
      JSON.stringify(readLocalEventDeletes().map((draft) => eventDeleteIds.has(draft.event_id) ? { ...draft, synced_at: syncedAt } : draft))
    );
  }

  window.dispatchEvent(new CustomEvent(localDraftsSyncedEvent, {
    detail: {
      companyDrafts,
      eventDrafts,
      companyUpdates,
      eventUpdates,
      companyDeletes,
      eventDeletes,
      syncedAt
    }
  }));
  window.dispatchEvent(new Event(localDraftsChangedEvent));
}

function isLocalEventDraft(value: unknown): value is LocalEventDraft {
  if (!value || typeof value !== "object") return false;
  return "draft_id" in value && typeof value.draft_id === "string";
}

function isLocalCompanyDraft(value: unknown): value is LocalCompanyDraft {
  if (!value || typeof value !== "object") return false;
  return "draft_id" in value && typeof value.draft_id === "string" && "company_id" in value && typeof value.company_id === "string";
}

function isLocalEventUpdateDraft(value: unknown): value is LocalEventUpdateDraft {
  if (!isLocalEventDraft(value)) return false;
  return "event_id" in value && typeof value.event_id === "string";
}

function isLocalCompanyUpdateDraft(value: unknown): value is LocalCompanyUpdateDraft {
  if (!isLocalCompanyDraft(value)) return false;
  return "company_id" in value && typeof value.company_id === "string";
}

function isLocalEventDeleteDraft(value: unknown): value is LocalEventDeleteDraft {
  if (!value || typeof value !== "object") return false;
  return "event_id" in value && typeof value.event_id === "string";
}

function isLocalCompanyDeleteDraft(value: unknown): value is LocalCompanyDeleteDraft {
  if (!value || typeof value !== "object") return false;
  return "company_id" in value && typeof value.company_id === "string";
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return unique;
}
