"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createEvent, syncLocalCompany, syncLocalDrafts } from "@/lib/actions";
import type { SheetRow } from "@/lib/google-sheets";
import type { Company } from "@/types/company";

export const localEventDraftsKey = "job-hunt-note.localEventDrafts";
export const localCompanyDraftsKey = "job-hunt-note.localCompanyDrafts";
export const localEventUpdatesKey = "job-hunt-note.localEventUpdates";
export const localCompanyUpdatesKey = "job-hunt-note.localCompanyUpdates";
const localDraftsChangedEvent = "job-hunt-note.localDraftsChanged";

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
  status: string;
  person: string;
  meeting_url: string;
  memo: string;
  sync_to_calendar: string;
  timezone: string;
  created_at: string;
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
};

export type LocalEventUpdateDraft = LocalEventDraft & {
  event_id: string;
};

export type LocalCompanyUpdateDraft = LocalCompanyDraft & {
  company_id: string;
};

export function saveLocalEventDraft(draft: LocalEventDraft) {
  const drafts = readLocalEventDrafts().filter((item) => item.draft_id !== draft.draft_id);
  window.localStorage.setItem(localEventDraftsKey, JSON.stringify([draft, ...drafts]));
  window.dispatchEvent(new Event(localDraftsChangedEvent));
}

export function saveLocalCompanyDraft(draft: LocalCompanyDraft) {
  const drafts = readLocalCompanyDrafts().filter((item) => item.company_id !== draft.company_id && item.draft_id !== draft.draft_id);
  window.localStorage.setItem(localCompanyDraftsKey, JSON.stringify([draft, ...drafts]));
  window.dispatchEvent(new Event(localDraftsChangedEvent));
}

export function saveLocalEventUpdate(draft: LocalEventUpdateDraft) {
  const drafts = readLocalEventUpdates().filter((item) => item.event_id !== draft.event_id);
  window.localStorage.setItem(localEventUpdatesKey, JSON.stringify([draft, ...drafts]));
  window.dispatchEvent(new Event(localDraftsChangedEvent));
}

export function saveLocalCompanyUpdate(draft: LocalCompanyUpdateDraft) {
  const drafts = readLocalCompanyUpdates().filter((item) => item.company_id !== draft.company_id);
  window.localStorage.setItem(localCompanyUpdatesKey, JSON.stringify([draft, ...drafts]));
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
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const syncedDraft = searchParams.get("syncedDraft");
  const companyNames = useMemo(
    () => new Map([
      ...companies.map((company) => [company.company_id, company.company_name] as const),
      ...companyDrafts.map((company) => [company.company_id, `${company.company_name}（未同期）`] as const)
    ]),
    [companies, companyDrafts]
  );
  const totalDrafts = eventDrafts.length + companyDrafts.length + eventUpdates.length + companyUpdates.length;

  useEffect(() => {
    if (!syncedDraft) return;
    if (syncedDraft === "all") {
      window.localStorage.removeItem(localEventDraftsKey);
      window.localStorage.removeItem(localCompanyDraftsKey);
      window.localStorage.removeItem(localEventUpdatesKey);
      window.localStorage.removeItem(localCompanyUpdatesKey);
      window.dispatchEvent(new Event(localDraftsChangedEvent));
    } else {
      removeLocalEventDraft(syncedDraft);
      removeLocalCompanyDraft(syncedDraft);
      removeLocalEventUpdate(syncedDraft);
      removeLocalCompanyUpdate(syncedDraft);
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete("syncedDraft");
    const suffix = next.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname);
  }, [pathname, router, searchParams, syncedDraft]);

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
            window.dispatchEvent(new Event(localDraftsChangedEvent));
          }}
          className="rounded-lg px-2 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100"
        >
          破棄
        </button>
      </div>
      <div className="mt-3 grid gap-2 border-t border-amber-200 pt-3">
        <form action={syncLocalDrafts} onSubmit={() => clearSyncedDraftsSoon("all")}>
          <input type="hidden" name="returnTo" value={returnToWithSyncedDraft(pathname, searchParams, "all")} />
          <input type="hidden" name="companies_json" value={JSON.stringify(companyDrafts)} />
          <input type="hidden" name="events_json" value={JSON.stringify(eventDrafts)} />
          <input type="hidden" name="company_updates_json" value={JSON.stringify(companyUpdates)} />
          <input type="hidden" name="event_updates_json" value={JSON.stringify(eventUpdates)} />
          <Button tone="primary" className="w-full">まとめて同期</Button>
        </form>
        <span className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-xs font-bold text-amber-800">
          新規 {companyDrafts.length + eventDrafts.length} / 編集 {companyUpdates.length + eventUpdates.length}
        </span>
      </div>
      <div className="mt-3 grid min-h-0 gap-2 overflow-y-auto pr-1">
        {companyDrafts.slice(0, 4).map((draft) => (
          <form
            key={draft.draft_id}
            action={syncLocalCompany}
            onSubmit={() => clearSyncedDraftsSoon(draft.draft_id)}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-amber-200 bg-white p-2"
          >
            <input type="hidden" name="returnTo" value={returnToWithSyncedDraft(pathname, searchParams, draft.draft_id)} />
            <CompanyDraftHiddenInputs draft={draft} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{draft.company_name || "企業名未設定"}</p>
              <p className="truncate text-xs font-semibold text-muted">企業追加 / 未同期</p>
            </div>
            <Button tone="primary">同期</Button>
          </form>
        ))}
        {eventDrafts.slice(0, Math.max(0, 4 - companyDrafts.length)).map((draft) => {
          const waitsForCompany = companyDrafts.some((company) => company.company_id === draft.company_id);

          return (
            <form
              key={draft.draft_id}
              action={createEvent}
              onSubmit={() => clearSyncedDraftsSoon(draft.draft_id)}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-amber-200 bg-white p-2"
            >
              <input type="hidden" name="returnTo" value={returnToWithSyncedDraft(pathname, searchParams, draft.draft_id)} />
              <EventDraftHiddenInputs draft={draft} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">
                  {draft.event_type || "予定"} / {companyNames.get(draft.company_id) ?? "企業未設定"}
                </p>
                <p className="truncate text-xs font-semibold text-muted">
                  {waitsForCompany ? "先に企業を同期してください" : draft.start_datetime || "日付未設定"}
                </p>
              </div>
              <Button tone="primary" disabled={waitsForCompany}>同期</Button>
            </form>
          );
        })}
        {companyUpdates.slice(0, 4).map((draft) => (
          <div key={`company-update-${draft.company_id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-amber-200 bg-white p-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{draft.company_name || "企業名未設定"}</p>
              <p className="truncate text-xs font-semibold text-muted">企業編集 / 未同期</p>
            </div>
            <span className="text-xs font-bold text-amber-800">待機中</span>
          </div>
        ))}
        {eventUpdates.slice(0, 4).map((draft) => (
          <div key={`event-update-${draft.event_id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-amber-200 bg-white p-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{draft.event_type || "予定"} / {companyNames.get(draft.company_id) ?? "企業未設定"}</p>
              <p className="truncate text-xs font-semibold text-muted">予定編集 / 未同期</p>
            </div>
            <span className="text-xs font-bold text-amber-800">待機中</span>
          </div>
        ))}
      </div>
    </aside>
    </>
  );
}

function CompanyDraftHiddenInputs({ draft }: { draft: LocalCompanyDraft }) {
  return (
    <>
      <input type="hidden" name="company_id" value={draft.company_id} />
      <input type="hidden" name="company_name" value={draft.company_name} />
      <input type="hidden" name="industry" value={draft.industry} />
      <input type="hidden" name="status" value={draft.status} />
      <input type="hidden" name="mypage_url" value={draft.mypage_url} />
      <input type="hidden" name="memo" value={draft.memo} />
      <input type="hidden" name="application_source" value={draft.application_source} />
    </>
  );
}

function EventDraftHiddenInputs({ draft }: { draft: LocalEventDraft }) {
  return (
    <>
      <input type="hidden" name="company_id" value={draft.company_id} />
      <input type="hidden" name="selection_type" value={draft.selection_type} />
      <input type="hidden" name="event_type" value={draft.event_type} />
      <input type="hidden" name="title" value={draft.title} />
      <input type="hidden" name="start_datetime" value={draft.start_datetime} />
      <input type="hidden" name="end_datetime" value={draft.end_datetime} />
      <input type="hidden" name="timezone" value={draft.timezone} />
      <input type="hidden" name="is_period" value={draft.is_period} />
      <input type="hidden" name="period_end_date" value={draft.period_end_date} />
      <input type="hidden" name="status" value={draft.status} />
      <input type="hidden" name="person" value={draft.person} />
      <input type="hidden" name="meeting_url" value={draft.meeting_url} />
      <input type="hidden" name="memo" value={draft.memo} />
      <input type="hidden" name="sync_to_calendar" value={draft.sync_to_calendar} />
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

function removeLocalEventDraft(draftId: string) {
  const next = readLocalEventDrafts().filter((draft) => draft.draft_id !== draftId);
  window.localStorage.setItem(localEventDraftsKey, JSON.stringify(next));
  window.dispatchEvent(new Event(localDraftsChangedEvent));
}

function removeLocalCompanyDraft(draftId: string) {
  const next = readLocalCompanyDrafts().filter((draft) => draft.draft_id !== draftId);
  window.localStorage.setItem(localCompanyDraftsKey, JSON.stringify(next));
  window.dispatchEvent(new Event(localDraftsChangedEvent));
}

function removeLocalEventUpdate(draftId: string) {
  const next = readLocalEventUpdates().filter((draft) => draft.event_id !== draftId);
  window.localStorage.setItem(localEventUpdatesKey, JSON.stringify(next));
  window.dispatchEvent(new Event(localDraftsChangedEvent));
}

function removeLocalCompanyUpdate(draftId: string) {
  const next = readLocalCompanyUpdates().filter((draft) => draft.company_id !== draftId);
  window.localStorage.setItem(localCompanyUpdatesKey, JSON.stringify(next));
  window.dispatchEvent(new Event(localDraftsChangedEvent));
}

function clearSyncedDraftsSoon(draftId: string) {
  window.setTimeout(() => {
    if (draftId === "all") {
      window.localStorage.removeItem(localEventDraftsKey);
      window.localStorage.removeItem(localCompanyDraftsKey);
      window.localStorage.removeItem(localEventUpdatesKey);
      window.localStorage.removeItem(localCompanyUpdatesKey);
      window.dispatchEvent(new Event(localDraftsChangedEvent));
      return;
    }

    removeLocalEventDraft(draftId);
    removeLocalCompanyDraft(draftId);
    removeLocalEventUpdate(draftId);
    removeLocalCompanyUpdate(draftId);
  }, 500);
}

function returnToWithSyncedDraft(pathname: string, searchParams: URLSearchParams, draftId: string) {
  const next = new URLSearchParams(searchParams.toString());
  next.set("syncedDraft", draftId);
  const suffix = next.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
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
