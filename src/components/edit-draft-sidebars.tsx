"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import {
  saveLocalCompanyUpdate,
  saveLocalEventDrafts,
  saveLocalEventDeletes,
  saveLocalEventUpdate,
  saveLocalEventUpdates,
  type LocalCompanyUpdateDraft,
  type LocalEventDraft,
  type LocalEventUpdateDraft
} from "@/components/local-draft-sync-panel";
import { Button } from "@/components/ui/button";
import { PeriodEventFields } from "@/components/period-event-fields";
import type { SheetRow } from "@/lib/google-sheets";
import { eventColorGroup } from "@/lib/planning";
import type { Company } from "@/types/company";
import { companyStatuses } from "@/types/company";
import type { JobEvent } from "@/types/event";
import { eventSelectionTypes, eventStatuses as allEventStatuses } from "@/types/event";

const EventDatetimeFields = dynamic(
  () => import("@/components/event-datetime-fields").then((mod) => mod.EventDatetimeFields),
  {
    ssr: false,
    loading: () => <div className="h-24 rounded-xl border border-line bg-slate-50" />
  }
);

export function EventDraftEditSidebar({
  event,
  events,
  companies,
  eventTypeOptions,
  timeZone,
  closeHref,
  onClose
}: {
  event: SheetRow<JobEvent>;
  events: SheetRow<JobEvent>[];
  companies: SheetRow<Company>[];
  eventTypeOptions: string[];
  timeZone: string;
  closeHref: string;
  onClose?: () => void;
}) {
  const seriesEvents = useMemo(() => {
    if (!event.event_series_id) return [event];
    return events
      .filter((candidate) => candidate.event_series_id === event.event_series_id)
      .sort((left, right) => Number(left.series_day_index || 0) - Number(right.series_day_index || 0));
  }, [event, events]);
  const editorEvent = seriesEvents[0] ?? event;
  const isSeries = Boolean(event.event_series_id);
  const seriesEndEvent = seriesEvents.at(-1) ?? editorEvent;
  const seriesSchedules = seriesEvents.map((seriesEvent) => ({
    date: datePart(seriesEvent.start_datetime),
    startTime: timePart(seriesEvent.start_datetime),
    endTime: timePart(seriesEvent.end_datetime)
  })).filter((schedule) => schedule.date && schedule.startTime && schedule.endTime);
  const seriesEndDate = seriesSchedules.at(-1)?.date ?? "";
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [eventDatetime, setEventDatetime] = useState({
    startDatetime: editorEvent.start_datetime,
    endDatetime: isSeries ? seriesEndEvent.end_datetime : editorEvent.end_datetime
  });
  const [eventType, setEventType] = useState(editorEvent.event_type);
  const [eventTimeMode, setEventTimeMode] = useState(defaultTimeModeForEventType(editorEvent.event_type));
  const eventStatuses = eventStatusOptionsForType(eventType);

  useEffect(() => {
    setEventDatetime({
      startDatetime: editorEvent.start_datetime,
      endDatetime: isSeries ? seriesEndEvent.end_datetime : editorEvent.end_datetime
    });
    setEventType(editorEvent.event_type);
    setEventTimeMode(defaultTimeModeForEventType(editorEvent.event_type));
    setSaved(false);
    setIsDirty(false);
  }, [editorEvent.end_datetime, editorEvent.event_id, editorEvent.event_type, editorEvent.start_datetime, isSeries, seriesEndEvent.end_datetime]);

  function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!isDirty) return;
    const formData = new FormData(formEvent.currentTarget);
    const base = {
      company_id: text(formData, "company_id"),
      selection_type: text(formData, "selection_type") || "本選考",
      event_type: text(formData, "event_type"),
      title: text(formData, "title"),
      start_datetime: text(formData, "start_datetime"),
      end_datetime: text(formData, "end_datetime"),
      timezone: text(formData, "timezone") || editorEvent.timezone || timeZone,
      is_period: text(formData, "is_period") || "false",
      period_end_date: text(formData, "period_end_date"),
      time_mode: text(formData, "time_mode") || editorEvent.time_mode || "datetime",
      status: text(formData, "status") || "予定",
      person: text(formData, "person"),
      meeting_url: normalizeUrl(text(formData, "meeting_url")),
      memo: text(formData, "memo"),
      sync_to_calendar: booleanText(formData, "sync_to_calendar"),
      created_at: new Date().toISOString()
    };

    const schedules = parsePeriodSchedules(text(formData, "period_days_json"));
    if (isSeries && schedules.length) {
      const title = removeSeriesDaySuffix(base.title || editorEvent.title || editorEvent.event_type);
      const updates: LocalEventUpdateDraft[] = [];
      const drafts: LocalEventDraft[] = [];
      schedules.forEach((schedule, index) => {
        const existing = seriesEvents[index];
        const scheduled = {
          ...base,
          title: `${title} | Day ${index + 1}`,
          start_datetime: `${schedule.date} ${schedule.startTime}`,
          end_datetime: `${schedule.date} ${schedule.endTime}`,
          is_period: "false",
          period_end_date: "",
          event_series_id: event.event_series_id,
          series_day_index: String(index + 1)
        };

        if (existing) {
          updates.push({ ...scheduled, draft_id: existing.event_id, event_id: existing.event_id } satisfies LocalEventUpdateDraft);
        } else {
          drafts.push({ ...scheduled, draft_id: crypto.randomUUID() } satisfies LocalEventDraft);
        }
      });
      const deletes = seriesEvents.slice(schedules.length).map((extraEvent) => ({
          event_id: extraEvent.event_id,
          label: extraEvent.title || extraEvent.event_type || "予定",
          created_at: new Date().toISOString()
        }));
      onClose?.();
      queueTask(() => {
        saveLocalEventUpdates(updates);
        saveLocalEventDrafts(drafts);
        saveLocalEventDeletes(deletes);
      });
    } else {
      const update = {
        ...base,
        draft_id: event.event_id,
        event_id: event.event_id,
        event_series_id: event.event_series_id,
        series_day_index: event.series_day_index
      } satisfies LocalEventUpdateDraft;
      onClose?.();
      queueTask(() => saveLocalEventUpdate(update));
    }
    setSaved(true);
  }

  function onDelete() {
    const now = new Date().toISOString();
    const targets = isSeries ? seriesEvents : [event];
    onClose?.();
    queueTask(() => saveLocalEventDeletes(targets.map((target) => ({
      event_id: target.event_id,
      label: target.title || target.event_type || "予定",
      created_at: now
    }))));
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between border-b border-line px-2 pb-4">
        <div>
          <h2 className="text-lg font-bold text-ink">イベントを編集</h2>
          <p className="mt-1 text-sm text-muted">保存するとローカルに即時保存され、あとでまとめて同期できます。</p>
        </div>
        <CloseControl href={closeHref} onClose={onClose} />
      </div>
      {saved ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          未同期の編集として保存しました。左下の「まとめて同期」からSheetsへ反映できます。
        </div>
      ) : null}
      <form onSubmit={onSubmit} onChangeCapture={() => setIsDirty(true)} className="grid flex-1 content-start gap-4 overflow-y-auto px-2 py-4">
        <Field label="企業"><CompanySelect companies={companies} defaultValue={editorEvent.company_id} /></Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="選考区分"><Select name="selection_type" options={eventSelectionTypes} defaultValue={editorEvent.selection_type || "本選考"} /></Field>
          <Field label="イベント種別"><Select name="event_type" options={eventTypeOptions} value={eventType} onChange={(value) => {
            setEventType(value);
            setEventTimeMode(defaultTimeModeForEventType(value));
          }} /></Field>
          <Field label="ステータス"><Select name="status" options={eventStatuses} defaultValue={editorEvent.status} /></Field>
        </div>
        <CalendarSyncCheckbox defaultChecked={editorEvent.sync_to_calendar === "true"} />
        <Field label="タイトル / サブ種別"><input name="title" defaultValue={isSeries ? removeSeriesDaySuffix(editorEvent.title) : editorEvent.title} /></Field>
        <EventDatetimeFields
          startDatetime={editorEvent.start_datetime}
          endDatetime={isSeries ? seriesEndEvent.end_datetime : editorEvent.end_datetime}
          timeZone={editorEvent.timezone || timeZone}
          timeMode={eventTimeMode}
          onDatetimeChange={setEventDatetime}
        />
        <PeriodEventFields
          key={event.event_series_id || event.event_id}
          startDatetime={eventDatetime.startDatetime}
          endDatetime={eventDatetime.endDatetime}
          initialEnabled={isSeries || event.is_period === "true"}
          initialEndDate={seriesEndDate || event.period_end_date}
          initialSchedules={seriesSchedules}
          syncEndDateWithEndDatetime={isSeries}
        />
        <Field label="担当者"><input name="person" defaultValue={editorEvent.person} /></Field>
        <Field label="場所 / URL"><input name="meeting_url" defaultValue={editorEvent.meeting_url} /></Field>
        <Field label="メモ"><textarea name="memo" rows={4} defaultValue={editorEvent.memo} /></Field>
        <div className="sticky bottom-0 z-10 -mx-2 mt-2 flex justify-between gap-2 border-t border-line bg-white px-2 py-4">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            削除
          </button>
          <CloseControl href={closeHref} onClose={onClose} variant="button" label="キャンセル" />
          <Button tone="primary" disabled={!isDirty}>ローカル保存</Button>
        </div>
      </form>
    </section>
  );
}

export function CompanyDraftEditSidebar({
  company,
  applicationSources,
  closeHref,
  onClose
}: {
  company: SheetRow<Company>;
  applicationSources: string[];
  closeHref: string;
  onClose?: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setSaved(false);
    setIsDirty(false);
  }, [company.company_id]);

  function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!isDirty) return;
    const formData = new FormData(formEvent.currentTarget);
    const draft: LocalCompanyUpdateDraft = {
      draft_id: company.company_id,
      company_id: company.company_id,
      company_name: text(formData, "company_name"),
      industry: text(formData, "industry"),
      status: text(formData, "status") || "検討中",
      mypage_url: normalizeUrl(text(formData, "mypage_url")),
      memo: text(formData, "memo"),
      application_source: text(formData, "application_source"),
      created_at: new Date().toISOString()
    };

    onClose?.();
    queueTask(() => saveLocalCompanyUpdate(draft));
    setSaved(true);
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between border-b border-line px-2 pb-4">
        <div>
          <h2 className="text-lg font-bold text-ink">企業を編集</h2>
          <p className="mt-1 text-sm text-muted">保存するとローカルに即時保存され、あとでまとめて同期できます。</p>
        </div>
        <CloseControl href={closeHref} onClose={onClose} />
      </div>
      {saved ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          未同期の編集として保存しました。左下の「まとめて同期」からSheetsへ反映できます。
        </div>
      ) : null}
      <form onSubmit={onSubmit} onChangeCapture={() => setIsDirty(true)} className="grid flex-1 gap-4 overflow-y-auto px-2 py-4 md:grid-cols-2">
        <Field label="企業名"><input name="company_name" required defaultValue={company.company_name} /></Field>
        <Field label="業界"><input name="industry" defaultValue={company.industry} /></Field>
        <Field label="ステータス"><Select name="status" options={companyStatuses.includes(company.status as (typeof companyStatuses)[number]) ? companyStatuses : [...companyStatuses, company.status]} defaultValue={company.status} /></Field>
        <Field label="応募媒体"><DatalistInput name="application_source" options={applicationSources} defaultValue={company.application_source} /></Field>
        <Field label="企業/採用URL"><input name="mypage_url" defaultValue={company.mypage_url} /></Field>
        <div className="md:col-span-2">
          <Field label="メモ"><textarea name="memo" rows={4} defaultValue={company.memo} /></Field>
        </div>
        <div className="sticky bottom-0 z-10 -mx-2 mt-2 flex justify-end gap-2 border-t border-line bg-white px-2 py-4 md:col-span-2">
          <CloseControl href={closeHref} onClose={onClose} variant="button" label="キャンセル" />
          <Button tone="primary" disabled={!isDirty}>ローカル保存</Button>
        </div>
      </form>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

function CloseControl({
  href,
  onClose,
  variant = "link",
  label = "閉じる"
}: {
  href: string;
  onClose?: () => void;
  variant?: "link" | "button";
  label?: string;
}) {
  const className = variant === "button"
    ? "inline-flex h-9 items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50"
    : "rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-slate-50 hover:text-ink";

  return onClose ? (
    <button type="button" onClick={onClose} className={className}>
      {label}
    </button>
  ) : (
    <Link href={href} prefetch={false} className={className}>
      {label}
    </Link>
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
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

function CalendarSyncCheckbox({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-line bg-slate-50 px-3 py-3 text-sm">
      <span>
        <span className="font-semibold text-ink">Google Calendar同期</span>
        <span className="mt-1 block text-xs text-muted">手動同期時にGoogle Calendarへ反映します。</span>
      </span>
      <input type="hidden" name="sync_to_calendar" value="false" />
      <input name="sync_to_calendar" type="checkbox" value="true" defaultChecked={defaultChecked} className="h-5 w-5 accent-brand" />
    </label>
  );
}

function CompanySelect({ companies, defaultValue }: { companies: SheetRow<Company>[]; defaultValue?: string }) {
  return (
    <select name="company_id" required defaultValue={defaultValue ?? ""}>
      <option value="" disabled>企業を選択</option>
      {companies.map((company) => (
        <option key={company.company_id} value={company.company_id}>{company.company_name}</option>
      ))}
    </select>
  );
}

function DatalistInput({ name, options, defaultValue }: { name: string; options: string[]; defaultValue?: string }) {
  const listId = `${name}-edit-options`;
  return (
    <>
      <input name={name} list={listId} defaultValue={defaultValue} />
      <datalist id={listId}>
        {options.map((option) => <option key={option} value={option} />)}
      </datalist>
    </>
  );
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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

function parsePeriodSchedules(value: string) {
  try {
    const parsed = JSON.parse(value) as Array<{ date?: string; startTime?: string; endTime?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((schedule) => /^\d{4}-\d{2}-\d{2}$/.test(schedule.date ?? "") && /^\d{2}:\d{2}$/.test(schedule.startTime ?? "") && /^\d{2}:\d{2}$/.test(schedule.endTime ?? "")) as Array<{ date: string; startTime: string; endTime: string }>;
  } catch {
    return [];
  }
}

function removeSeriesDaySuffix(value: string) {
  return value.replace(/\s*\|\s*Day\s+\d+$/i, "").trim();
}

function datePart(value: string) {
  return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
}

function timePart(value: string) {
  return value.match(/[T\s](\d{2}:\d{2})$/)?.[1] ?? "";
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
