"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";

import {
  saveLocalCompanyUpdate,
  saveLocalEventUpdate,
  type LocalCompanyUpdateDraft,
  type LocalEventUpdateDraft
} from "@/components/local-draft-sync-panel";
import { Button } from "@/components/ui/button";
import type { SheetRow } from "@/lib/google-sheets";
import type { Company } from "@/types/company";
import { companyStatuses } from "@/types/company";
import type { JobEvent } from "@/types/event";
import { eventSelectionTypes, eventStatuses } from "@/types/event";

const EventDatetimeFields = dynamic(
  () => import("@/components/event-datetime-fields").then((mod) => mod.EventDatetimeFields),
  {
    ssr: false,
    loading: () => <div className="h-24 rounded-xl border border-line bg-slate-50" />
  }
);

export function EventDraftEditSidebar({
  event,
  companies,
  eventTypeOptions,
  timeZone,
  closeHref,
  onClose
}: {
  event: SheetRow<JobEvent>;
  companies: SheetRow<Company>[];
  eventTypeOptions: string[];
  timeZone: string;
  closeHref: string;
  onClose?: () => void;
}) {
  const [saved, setSaved] = useState(false);

  function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const formData = new FormData(formEvent.currentTarget);
    const draft: LocalEventUpdateDraft = {
      draft_id: event.event_id,
      event_id: event.event_id,
      company_id: text(formData, "company_id"),
      selection_type: text(formData, "selection_type") || "本選考",
      event_type: text(formData, "event_type"),
      title: text(formData, "title"),
      start_datetime: text(formData, "start_datetime"),
      end_datetime: text(formData, "end_datetime"),
      timezone: text(formData, "timezone") || event.timezone || timeZone,
      is_period: text(formData, "is_period") || "false",
      period_end_date: text(formData, "period_end_date"),
      status: text(formData, "status") || "予定",
      person: text(formData, "person"),
      meeting_url: normalizeUrl(text(formData, "meeting_url")),
      memo: text(formData, "memo"),
      sync_to_calendar: booleanText(formData, "sync_to_calendar"),
      created_at: new Date().toISOString()
    };

    saveLocalEventUpdate(draft);
    setSaved(true);
    onClose?.();
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
      <form onSubmit={onSubmit} className="grid flex-1 content-start gap-4 overflow-y-auto px-2 py-4">
        <Field label="企業"><CompanySelect companies={companies} defaultValue={event.company_id} /></Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="選考区分"><Select name="selection_type" options={eventSelectionTypes} defaultValue={event.selection_type || "本選考"} /></Field>
          <Field label="イベント種別"><Select name="event_type" options={eventTypeOptions} defaultValue={event.event_type} /></Field>
          <Field label="ステータス"><Select name="status" options={eventStatuses} defaultValue={event.status} /></Field>
        </div>
        <CalendarSyncCheckbox defaultChecked={event.sync_to_calendar === "true"} />
        <Field label="タイトル / サブ種別"><input name="title" defaultValue={event.title} /></Field>
        <EventDatetimeFields startDatetime={event.start_datetime} endDatetime={event.end_datetime} timeZone={event.timezone || timeZone} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="期間イベント"><Select name="is_period" options={["false", "true"]} defaultValue={event.is_period || "false"} /></Field>
          <Field label="期間終了日"><input name="period_end_date" type="date" defaultValue={event.period_end_date} /></Field>
        </div>
        <Field label="担当者"><input name="person" defaultValue={event.person} /></Field>
        <Field label="場所 / URL"><input name="meeting_url" defaultValue={event.meeting_url} /></Field>
        <Field label="メモ"><textarea name="memo" rows={4} defaultValue={event.memo} /></Field>
        <div className="mt-auto flex justify-end gap-2 border-t border-line pt-4">
          <CloseControl href={closeHref} onClose={onClose} variant="button" label="キャンセル" />
          <Button tone="primary">ローカル保存</Button>
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

  function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const formData = new FormData(formEvent.currentTarget);
    const draft: LocalCompanyUpdateDraft = {
      draft_id: company.company_id,
      company_id: company.company_id,
      company_name: text(formData, "company_name"),
      industry: text(formData, "industry"),
      status: text(formData, "status") || "選考中",
      mypage_url: normalizeUrl(text(formData, "mypage_url")),
      memo: text(formData, "memo"),
      application_source: text(formData, "application_source"),
      created_at: new Date().toISOString()
    };

    saveLocalCompanyUpdate(draft);
    setSaved(true);
    onClose?.();
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
      <form onSubmit={onSubmit} className="grid flex-1 gap-4 overflow-y-auto px-2 py-4 md:grid-cols-2">
        <Field label="企業名"><input name="company_name" required defaultValue={company.company_name} /></Field>
        <Field label="業界"><input name="industry" defaultValue={company.industry} /></Field>
        <Field label="ステータス"><Select name="status" options={companyStatuses} defaultValue={company.status} /></Field>
        <Field label="応募媒体"><DatalistInput name="application_source" options={applicationSources} defaultValue={company.application_source} /></Field>
        <Field label="企業/採用URL"><input name="mypage_url" defaultValue={company.mypage_url} /></Field>
        <div className="md:col-span-2">
          <Field label="メモ"><textarea name="memo" rows={4} defaultValue={company.memo} /></Field>
        </div>
        <div className="flex justify-end gap-2 md:col-span-2">
          <CloseControl href={closeHref} onClose={onClose} variant="button" label="キャンセル" />
          <Button tone="primary">ローカル保存</Button>
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

function Select({ name, options, defaultValue }: { name: string; options: readonly string[]; defaultValue?: string }) {
  return (
    <select name={name} defaultValue={defaultValue}>
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
