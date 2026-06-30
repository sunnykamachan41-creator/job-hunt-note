"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { addMinutesLocal } from "@/components/event-datetime-fields";

import {
  saveLocalCompanyDraft,
  saveLocalEventDrafts,
  type LocalCompanyDraft,
  type LocalEventDraft
} from "@/components/local-draft-sync-panel";
import { Button } from "@/components/ui/button";
import { PeriodEventFields } from "@/components/period-event-fields";
import { defaultCalendarSyncForEventType } from "@/lib/calendar-sync";
import type { SheetRow } from "@/lib/google-sheets";
import { eventColorGroup } from "@/lib/planning";
import type { Company } from "@/types/company";
import { companyStatuses } from "@/types/company";
import { eventSelectionTypes, eventStatuses as allEventStatuses } from "@/types/event";

type AddMode = "company" | "event" | null;
type AddRequest = AddMode | { mode?: AddMode; companyId?: string; date?: string; startDatetime?: string; endDatetime?: string; timeMode?: string };
const addPreviewEventName = "job-hunt-note:event-add-preview";
const clearPreviewEventName = "job-hunt-note:event-preview-clear";

const EventDatetimeFields = dynamic(
  () => import("@/components/event-datetime-fields").then((mod) => mod.EventDatetimeFields),
  {
    ssr: false,
    loading: () => <div className="h-24 rounded-xl border border-line bg-slate-50" />
  }
);

export function AddEntityActions({
  companies,
  applicationSources,
  eventTypeOptions,
  timeZone = "Asia/Tokyo",
  initialMode,
  request,
  requestVersion,
  inline = true,
  returnTo = "/?view=companies",
  listenToGlobal = true,
  eventPresentation = "fixed",
  onClose
}: {
  companies: SheetRow<Company>[];
  applicationSources: string[];
  eventTypeOptions: string[];
  timeZone?: string;
  initialMode?: AddMode;
  request?: AddRequest | null;
  requestVersion?: number;
  inline?: boolean;
  returnTo?: string;
  listenToGlobal?: boolean;
  eventPresentation?: "fixed" | "panel";
  onClose?: () => void;
}) {
  const [mode, setMode] = useState<AddMode>(initialMode ?? null);
  const [defaultCompanyId, setDefaultCompanyId] = useState("");
  const [defaultStartDatetime, setDefaultStartDatetime] = useState("");
  const [defaultEndDatetime, setDefaultEndDatetime] = useState("");
  const [defaultTimeMode, setDefaultTimeMode] = useState<string | undefined>(undefined);
  const [eventType, setEventType] = useState(eventTypeOptions[0] ?? "");
  const [eventDatetime, setEventDatetime] = useState({ startDatetime: "", endDatetime: "" });
  const [syncToCalendar, setSyncToCalendar] = useState(defaultCalendarSyncForEventType(eventTypeOptions[0] ?? ""));
  const [isDirty, setIsDirty] = useState(false);
  const eventStatuses = eventStatusOptionsForType(eventType);
  const isSavingRef = useRef(false);
  const selectableCompanies = useMemo(() => {
    const byId = new Map<string, SheetRow<Company>>();
    for (const company of companies) {
      if (!byId.has(company.company_id)) {
        byId.set(company.company_id, company);
      }
    }

    return [...byId.values()];
  }, [companies]);

  useEffect(() => {
    setMode(initialMode ?? null);
  }, [initialMode]);

  const openFromRequest = useCallback((detail: AddRequest) => {
    const nextMode = typeof detail === "object" && detail !== null ? detail.mode : detail;
    if (nextMode === "company" || nextMode === "event") {
      isSavingRef.current = false;
      const requestedStart = nextMode === "event" && typeof detail === "object" && detail?.startDatetime ? detail.startDatetime : "";
      const requestedDate = nextMode === "event" && typeof detail === "object" && detail?.date ? detail.date : "";
      const startDatetime = requestedStart || (requestedDate ? `${requestedDate} 09:00` : "");
      const endDatetime = nextMode === "event" && typeof detail === "object" && detail?.endDatetime ? detail.endDatetime : startDatetime ? addMinutesLocal(startDatetime, 60) : "";
      const requestedCompanyId = nextMode === "event" && typeof detail === "object" && detail?.companyId ? detail.companyId : "";
      setDefaultCompanyId(requestedCompanyId);
      setDefaultStartDatetime(startDatetime);
      setDefaultEndDatetime(endDatetime);
      setDefaultTimeMode(nextMode === "event" && typeof detail === "object" && detail?.timeMode ? detail.timeMode : undefined);
      setIsDirty(false);
      if (nextMode === "event" && requestedDate) {
        emitEventAddPreview({ date: requestedDate, companyId: requestedCompanyId, startDatetime, endDatetime });
      }
      setMode(nextMode);
    }
  }, []);

  useEffect(() => {
    function onPreviewChange(event: Event) {
      const detail = (event as CustomEvent<{ companyId?: string; startDatetime?: string; endDatetime?: string; date?: string }>).detail;
      if (!detail?.startDatetime) return;
      if (detail.companyId) {
        setDefaultCompanyId(detail.companyId);
      }
      setDefaultStartDatetime(detail.startDatetime);
      setDefaultEndDatetime(detail.endDatetime || "");
      setDefaultTimeMode(detail.endDatetime ? "datetime" : "date_only");
      setEventDatetime({ startDatetime: detail.startDatetime, endDatetime: detail.endDatetime || "" });
      setIsDirty(true);
    }

    window.addEventListener("job-hunt-note:event-add-preview-change", onPreviewChange);
    return () => window.removeEventListener("job-hunt-note:event-add-preview-change", onPreviewChange);
  }, []);

  useEffect(() => {
    function onOpen(event: Event) {
      openFromRequest((event as CustomEvent<AddRequest>).detail);
    }

    if (!listenToGlobal) return;
    window.addEventListener("job-hunt-note:add", onOpen);
    return () => window.removeEventListener("job-hunt-note:add", onOpen);
  }, [listenToGlobal, openFromRequest]);

  useEffect(() => {
    if (request) {
      openFromRequest(request);
    }
  }, [openFromRequest, request, requestVersion]);

  useEffect(() => {
    if (mode) {
      isSavingRef.current = false;
      setIsDirty(false);
    }
  }, [mode]);

  useEffect(() => {
    const nextType = eventTypeOptions[0] ?? "";
    setEventType(nextType);
    setDefaultTimeMode(defaultTimeModeForEventType(nextType));
    setSyncToCalendar(defaultCalendarSyncForEventType(nextType));
  }, [eventTypeOptions]);

  const close = useCallback(function close() {
    clearEventAddPreview();
    setMode(null);
    onClose?.();
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", inline ? `${returnTo}#add-actions` : returnTo);
    }
  }, [inline, onClose, returnTo]);

  useEffect(() => {
    return () => clearEventAddPreview();
  }, []);

  useEffect(() => {
    if (!mode) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, mode]);

  function handleEventDraftSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDirty) return;
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    const formData = new FormData(event.currentTarget);
    const drafts = localDraftsFromFormData(formData);
    const draft = drafts[0];

    if (!draft?.company_id) {
      isSavingRef.current = false;
      window.alert("企業を選択してください。");
      return;
    }

    close();
    queueTask(() => saveLocalEventDrafts(drafts));
  }

  function handleCompanyDraftSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDirty) return;
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    const formData = new FormData(event.currentTarget);
    const draft = localCompanyDraftFromFormData(formData);

    if (!draft.company_name) {
      isSavingRef.current = false;
      window.alert("企業名を入力してください。");
      return;
    }

    close();
    queueTask(() => saveLocalCompanyDraft(draft));
  }

  return (
    <div id="add-actions" className={inline ? "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-4 shadow-sm" : "contents"}>
      {inline ? (
        <>
          <div>
            <h2 className="text-lg font-semibold text-ink">追加</h2>
            <p className="mt-1 text-sm text-muted">新規作成はフォームを開いて入力します。一覧内の新規行入力は使いません。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode("company")}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-brand bg-brand px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              企業追加
            </button>
            <button
              type="button"
              onClick={() => setMode("event")}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink shadow-sm transition hover:bg-slate-50"
            >
              イベント追加
            </button>
          </div>
        </>
      ) : null}

      {mode === "company" ? (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-ink/30 p-4"
          onMouseDown={close}
        >
          <div
            className="w-full max-w-xl rounded-xl border border-line bg-white shadow-sm"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold">企業を追加</h3>
                <p className="mt-1 text-sm text-muted">応募先の基本情報を登録します。</p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-slate-50 hover:text-ink"
              >
                閉じる
              </button>
            </div>
            <form onSubmit={handleCompanyDraftSave} onChangeCapture={() => setIsDirty(true)} className="grid gap-4 p-6">
              <input type="hidden" name="returnTo" value={returnTo} />
              <Field label="企業名"><input name="company_name" required placeholder="例: ワークスアプリケーションズ" /></Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="ステータス"><Select name="status" options={companyStatuses} /></Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="業界"><input name="industry" placeholder="IT" /></Field>
                <Field label="応募媒体"><DatalistInput name="application_source" options={applicationSources} placeholder="OfferBox" /></Field>
              </div>
              <Field label="企業 / 採用URL"><input name="mypage_url" type="url" placeholder="https://" /></Field>
              <Field label="メモ"><textarea name="memo" rows={3} placeholder="選考メモ、志望理由、気になる点など" /></Field>
              <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-2 border-t border-line bg-white px-6 py-4">
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50"
                >
                  キャンセル
                </button>
                <Button tone="primary" disabled={!isDirty}>保存</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {mode === "event" ? (
        <div className={eventPresentation === "panel" ? "h-full w-full" : "fixed bottom-0 right-0 top-0 z-[120] w-full max-w-[480px] border-l border-line bg-white shadow-[-12px_0_32px_rgba(15,23,42,0.08)]"}>
          <div
            className="flex h-full w-full flex-col"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-line px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold">イベントを追加</h3>
                <p className="mt-1 text-sm text-muted">面接、締切、説明会などを登録します。</p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-slate-50 hover:text-ink"
              >
                閉じる
              </button>
            </div>
            <form onSubmit={handleEventDraftSave} onChangeCapture={() => setIsDirty(true)} className="grid flex-1 content-start gap-4 overflow-y-auto overflow-x-hidden p-6">
              <input type="hidden" name="returnTo" value={returnTo} />
              <Field label="企業"><CompanySelect key={defaultCompanyId || "empty-company"} companies={selectableCompanies} defaultValue={defaultCompanyId} /></Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="選考区分"><Select name="selection_type" options={eventSelectionTypes} /></Field>
                <Field label="イベント種別">
                  <Select
                    name="event_type"
                    options={eventTypeOptions}
                    value={eventType}
                    onChange={(value) => {
                      setEventType(value);
                      setDefaultTimeMode(defaultTimeModeForEventType(value));
                      setSyncToCalendar(defaultCalendarSyncForEventType(value));
                    }}
                  />
                </Field>
                <Field label="ステータス"><Select name="status" options={eventStatuses} /></Field>
              </div>
              <CalendarSyncToggle checked={syncToCalendar} onChange={setSyncToCalendar} />
              <Field label="タイトル / サブ種別"><input name="title" placeholder="一次面接" /></Field>
              <EventDatetimeFields
                startDatetime={defaultStartDatetime}
                endDatetime={defaultEndDatetime}
                timeZone={timeZone}
                timeMode={defaultTimeMode ?? defaultTimeModeForEventType(eventType)}
                onDatetimeChange={(value) => {
                  setEventDatetime(value);
                  const date = value.startDatetime.slice(0, 10);
                  if (date) {
                    emitEventAddPreview({
                      date,
                      companyId: defaultCompanyId,
                      startDatetime: value.startDatetime,
                      endDatetime: value.endDatetime
                    });
                  }
                }}
              />
              <PeriodEventFields startDatetime={eventDatetime.startDatetime} endDatetime={eventDatetime.endDatetime} />
              <Field label="担当者"><input name="person" placeholder="担当者名" /></Field>
              <Field label="場所 / URL"><input name="meeting_url" type="url" placeholder="https://" /></Field>
              <Field label="メモ"><textarea name="memo" rows={4} placeholder="準備事項、聞きたいことなど" /></Field>
              <div className="sticky bottom-0 z-10 -mx-6 mt-2 flex justify-end gap-2 border-t border-line bg-white px-6 py-4">
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50"
                >
                  キャンセル
                </button>
                <Button tone="primary" disabled={!companies.length || !isDirty}>ローカル保存</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function localDraftsFromFormData(formData: FormData): LocalEventDraft[] {
  const base = {
    company_id: text(formData, "company_id"),
    selection_type: text(formData, "selection_type") || "本選考",
    event_type: text(formData, "event_type"),
    title: text(formData, "title"),
    start_datetime: text(formData, "start_datetime"),
    end_datetime: text(formData, "end_datetime"),
    is_period: text(formData, "is_period") || "false",
    period_end_date: text(formData, "period_end_date"),
    status: text(formData, "status") || "予定",
    person: text(formData, "person"),
    meeting_url: normalizeUrl(text(formData, "meeting_url")),
    memo: text(formData, "memo"),
    sync_to_calendar: booleanText(formData, "sync_to_calendar"),
    timezone: text(formData, "timezone") || "Asia/Tokyo",
    time_mode: text(formData, "time_mode") || "datetime",
    created_at: new Date().toISOString()
  };

  if (base.is_period !== "true") {
    return [{ ...base, draft_id: crypto.randomUUID(), event_series_id: "", series_day_index: "" }];
  }

  const schedules = parsePeriodSchedules(text(formData, "period_days_json"));
  const resolvedSchedules = schedules.length ? schedules : fallbackPeriodSchedules(base);
  const seriesId = crypto.randomUUID();
  const titleBase = base.title || base.event_type;

  return resolvedSchedules.map((schedule, index) => ({
    ...base,
    draft_id: crypto.randomUUID(),
    title: `${titleBase} | Day ${index + 1}`,
    start_datetime: `${schedule.date} ${schedule.startTime}`,
    end_datetime: `${schedule.date} ${schedule.endTime}`,
    is_period: "false",
    period_end_date: "",
    event_series_id: seriesId,
    series_day_index: String(index + 1),
    time_mode: base.time_mode
  }));
}

function parsePeriodSchedules(value: string) {
  try {
    const parsed = JSON.parse(value) as Array<{ date?: string; startTime?: string; endTime?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((schedule) => /^\d{4}-\d{2}-\d{2}$/.test(schedule.date ?? "") && /^\d{2}:\d{2}$/.test(schedule.startTime ?? "") && /^\d{2}:\d{2}$/.test(schedule.endTime ?? "")) as Array<{ date: string; startTime: string; endTime: string }>;
  } catch {
    return [];
  }
}

function emitEventAddPreview(detail: { date: string; companyId?: string; startDatetime?: string; endDatetime?: string }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(addPreviewEventName, { detail }));
}

function clearEventAddPreview() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(clearPreviewEventName));
}

function defaultTimeModeForEventType(eventType: string) {
  const group = eventColorGroup(eventType);
  return group === "submission" || group === "test" ? "date_only" : "datetime";
}
function eventStatusOptionsForType(eventType: string) {
  const group = eventColorGroup(eventType);
  if (group === "test" || group === "selection") {
    return allEventStatuses.filter((status) => status !== "完了" && status !== "保留");
  }
  return allEventStatuses.filter((status) => status !== "結果待ち" && status !== "保留");
}

function fallbackPeriodSchedules(base: Omit<LocalEventDraft, "draft_id" | "event_series_id" | "series_day_index">) {
  const startDate = base.start_datetime.slice(0, 10);
  const startTime = base.start_datetime.slice(-5) || "09:00";
  const endTime = base.end_datetime.slice(-5) || "10:00";
  const endDate = base.period_end_date || startDate;
  const dates: Array<{ date: string; startTime: string; endTime: string }> = [];
  const cursor = parseLocalDate(startDate);
  const last = parseLocalDate(endDate);

  while (!Number.isNaN(cursor.getTime()) && cursor <= last && dates.length < 31) {
    dates.push({ date: formatDateKey(cursor), startTime, endTime });
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function parseLocalDate(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return new Date(Number.NaN);
  return new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
}

function formatDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function localCompanyDraftFromFormData(formData: FormData): LocalCompanyDraft {
  const companyId = crypto.randomUUID();

  return {
    draft_id: companyId,
    company_id: companyId,
    company_name: text(formData, "company_name"),
    industry: text(formData, "industry"),
    status: text(formData, "status") || "検討中",
    mypage_url: normalizeUrl(text(formData, "mypage_url")),
    memo: text(formData, "memo"),
    application_source: text(formData, "application_source"),
    created_at: new Date().toISOString()
  };
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function booleanText(formData: FormData, key: string) {
  return formData.getAll(key).some((value) => value === "true") ? "true" : "false";
}

function normalizeUrl(value: string) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(value)) {
    return `https://${value}`;
  }
  return value;
}

function queueTask(task: () => void) {
  window.setTimeout(task, 0);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

function Select({
  name,
  options,
  defaultValue,
  value,
  onChange
}: {
  name: string;
  options: readonly string[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <select
      name={name}
      defaultValue={value === undefined ? defaultValue : undefined}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function CalendarSyncToggle({
  checked,
  onChange
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-line bg-slate-50 px-3 py-3 text-sm">
      <span>
        <span className="font-semibold text-ink">Google Calendar同期</span>
        <span className="mt-1 block text-xs text-muted">アプリからGoogle Calendarへ一方向同期します。</span>
      </span>
      <input type="hidden" name="sync_to_calendar" value="false" />
      <input
        name="sync_to_calendar"
        type="checkbox"
        value="true"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-brand"
      />
    </label>
  );
}

function CompanySelect({
  companies,
  defaultValue
}: {
  companies: SheetRow<Company>[];
  defaultValue?: string;
}) {
  return (
    <select name="company_id" required defaultValue={defaultValue ?? ""}>
      <option value="" disabled>
        企業を選択
      </option>
      {companies.map((company) => (
        <option key={company.company_id} value={company.company_id}>
          {company.company_name}
        </option>
      ))}
    </select>
  );
}

function DatalistInput({
  name,
  options,
  defaultValue,
  placeholder
}: {
  name: string;
  options: string[];
  defaultValue?: string;
  placeholder?: string;
}) {
  const listId = `${name}-options-client`;

  return (
    <>
      <input name={name} list={listId} defaultValue={defaultValue} placeholder={placeholder} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}
