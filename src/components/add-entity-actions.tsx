"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";

import {
  saveLocalCompanyDraft,
  saveLocalEventDraft,
  useLocalCompanyDrafts,
  type LocalCompanyDraft,
  type LocalEventDraft
} from "@/components/local-draft-sync-panel";
import { Button } from "@/components/ui/button";
import { defaultCalendarSyncForEventType } from "@/lib/calendar-sync";
import type { SheetRow } from "@/lib/google-sheets";
import type { Company } from "@/types/company";
import { companyStatuses } from "@/types/company";
import { eventSelectionTypes, eventStatuses } from "@/types/event";

type AddMode = "company" | "event" | null;

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
  inline = true,
  returnTo = "/?view=companies"
}: {
  companies: SheetRow<Company>[];
  applicationSources: string[];
  eventTypeOptions: string[];
  timeZone?: string;
  initialMode?: AddMode;
  inline?: boolean;
  returnTo?: string;
}) {
  const [mode, setMode] = useState<AddMode>(initialMode ?? null);
  const [eventType, setEventType] = useState(eventTypeOptions[0] ?? "");
  const [syncToCalendar, setSyncToCalendar] = useState(defaultCalendarSyncForEventType(eventTypeOptions[0] ?? ""));
  const localCompanies = useLocalCompanyDrafts();
  const selectableCompanies = [
    ...localCompanies.map((company) => ({
      _rowNumber: -1,
      company_id: company.company_id,
      company_name: `${company.company_name}（未同期）`,
      industry: company.industry,
      status: company.status,
      recruitment_source: "",
      order_index: "0",
      mypage_url: company.mypage_url,
      memo: company.memo,
      created_at: company.created_at,
      updated_at: company.created_at,
      application_source: company.application_source
    } satisfies SheetRow<Company>)),
    ...companies
  ];

  useEffect(() => {
    setMode(initialMode ?? null);
  }, [initialMode]);

  useEffect(() => {
    function onOpen(event: Event) {
      const mode = (event as CustomEvent<AddMode>).detail;
      if (mode === "company" || mode === "event") {
        setMode(mode);
      }
    }

    window.addEventListener("job-hunt-note:add", onOpen);
    return () => window.removeEventListener("job-hunt-note:add", onOpen);
  }, []);

  useEffect(() => {
    const nextType = eventTypeOptions[0] ?? "";
    setEventType(nextType);
    setSyncToCalendar(defaultCalendarSyncForEventType(nextType));
  }, [eventTypeOptions]);

  const close = useCallback(function close() {
    setMode(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", inline ? `${returnTo}#add-actions` : returnTo);
    }
  }, [inline, returnTo]);

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
    const formData = new FormData(event.currentTarget);
    const draft = localDraftFromFormData(formData);

    if (!draft.company_id) {
      window.alert("企業を選択してください。");
      return;
    }

    saveLocalEventDraft(draft);
    close();
  }

  function handleCompanyDraftSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const draft = localCompanyDraftFromFormData(formData);

    if (!draft.company_name) {
      window.alert("企業名を入力してください。");
      return;
    }

    saveLocalCompanyDraft(draft);
    close();
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
            <form onSubmit={handleCompanyDraftSave} className="grid gap-4 p-6">
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
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50"
                >
                  キャンセル
                </button>
                <Button tone="primary">保存</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {mode === "event" ? (
        <div className="fixed bottom-0 right-0 top-0 z-[120] w-full max-w-[480px] border-l border-line bg-white shadow-[-12px_0_32px_rgba(15,23,42,0.08)]">
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
            <form onSubmit={handleEventDraftSave} className="grid flex-1 content-start gap-4 overflow-y-auto overflow-x-hidden p-6">
              <input type="hidden" name="returnTo" value={returnTo} />
              <Field label="企業"><CompanySelect companies={selectableCompanies} /></Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="選考区分"><Select name="selection_type" options={eventSelectionTypes} /></Field>
                <Field label="イベント種別">
                  <Select
                    name="event_type"
                    options={eventTypeOptions}
                    value={eventType}
                    onChange={(value) => {
                      setEventType(value);
                      setSyncToCalendar(defaultCalendarSyncForEventType(value));
                    }}
                  />
                </Field>
                <Field label="ステータス"><Select name="status" options={eventStatuses} /></Field>
              </div>
              <CalendarSyncToggle checked={syncToCalendar} onChange={setSyncToCalendar} />
              <Field label="タイトル / サブ種別"><input name="title" placeholder="一次面接" /></Field>
              <EventDatetimeFields timeZone={timeZone} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="期間イベント"><Select name="is_period" options={["false", "true"]} /></Field>
                <Field label="期間終了日"><input name="period_end_date" type="date" /></Field>
              </div>
              <Field label="担当者"><input name="person" placeholder="担当者名" /></Field>
              <Field label="場所 / URL"><input name="meeting_url" type="url" placeholder="https://" /></Field>
              <Field label="メモ"><textarea name="memo" rows={4} placeholder="準備事項、聞きたいことなど" /></Field>
              <div className="mt-auto flex justify-end gap-2 border-t border-line pt-4">
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-50"
                >
                  キャンセル
                </button>
                <Button tone="primary" disabled={!companies.length}>ローカル保存</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function localDraftFromFormData(formData: FormData): LocalEventDraft {
  return {
    draft_id: crypto.randomUUID(),
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
    created_at: new Date().toISOString()
  };
}

function localCompanyDraftFromFormData(formData: FormData): LocalCompanyDraft {
  const companyId = crypto.randomUUID();

  return {
    draft_id: companyId,
    company_id: companyId,
    company_name: text(formData, "company_name"),
    industry: text(formData, "industry"),
    status: text(formData, "status") || "選考中",
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
