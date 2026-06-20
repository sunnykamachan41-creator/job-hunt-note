import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createEvent, deleteEvent, updateCompany, updateEvent } from "@/lib/actions";
import { defaultCalendarSyncForEventType } from "@/lib/calendar-sync";
import { listSheetRows, readCachedSheetRows, type SheetRow } from "@/lib/google-sheets";
import {
  eventDate,
  eventKindLabel,
  eventScheduleLabel,
  eventTypeTone,
  isDeadlineEvent,
  isInactiveStatus,
  nextEventForCompany,
  relativeDayLabel,
  sortEventsBySchedule,
  statusTone
} from "@/lib/planning";
import { toSettingRecord } from "@/lib/records";
import type { Company } from "@/types/company";
import { companyStatuses } from "@/types/company";
import type { JobEvent } from "@/types/event";
import { eventSelectionTypes, eventStatuses } from "@/types/event";
import type { Setting } from "@/types/settings";

export const dynamic = "force-dynamic";

type CompanyDetailProps = {
  params: Promise<{
    companyId: string;
  }>;
  searchParams?: Promise<{
    actionError?: string;
    _refresh?: string;
  }>;
};

type DetailData = {
  companies: SheetRow<Company>[];
  company: SheetRow<Company> | null;
  events: SheetRow<JobEvent>[];
  settings: SheetRow<Setting>[];
  error: string | null;
};

async function getDetailData(companyId: string, options: { fresh?: boolean } = {}): Promise<DetailData> {
  try {
    const [companies, allEvents, settings] = await Promise.all([
      options.fresh ? listSheetRows<Company>("companies", options) : readCachedSheetRows<Company>("companies"),
      options.fresh ? listSheetRows<JobEvent>("events", options) : readCachedSheetRows<JobEvent>("events"),
      options.fresh ? listSheetRows<Setting>("settings", options) : readCachedSheetRows<Setting>("settings")
    ]);
    const company = companies.find((candidate) => candidate.company_id === companyId) ?? null;
    const events = sortEventsBySchedule(
      allEvents.filter((event) => event.company_id === companyId)
    );

    return { companies, company, events, settings, error: null };
  } catch (error) {
    return {
      companies: [],
      company: null,
      events: [],
      settings: [],
      error: error instanceof Error ? error.message : "Google Sheets connection failed"
    };
  }
}

export default async function CompanyDetail({ params, searchParams }: CompanyDetailProps) {
  const { companyId } = await params;
  const query = await searchParams;
  const { companies, company, events, settings, error } = await getDetailData(companyId, { fresh: Boolean(query?._refresh) });
  const actionError = query?.actionError;

  if (!error && !company) {
    notFound();
  }

  const returnTo = `/companies/${companyId}`;
  const applicationSources = settings
    .filter((setting) => setting.group === "application_source")
    .sort((a, b) => toSettingRecord(a).sort_order - toSettingRecord(b).sort_order)
    .map((setting) => setting.value);
  const eventTypeOptions = settings
    .filter((setting) => setting.group === "main_category")
    .sort((a, b) => toSettingRecord(a).sort_order - toSettingRecord(b).sort_order)
    .map((setting) => setting.value);
  const eventTypeChoices = eventTypeOptions.length
    ? eventTypeOptions
    : ["ES", "Webテスト", "適性検査", "面接", "GD", "インターン", "説明会", "その他"];
  const nextEvent = company ? nextEventForCompany(company, events) : undefined;
  const contactPerson = nextEvent?.person || [...events].reverse().find((event) => event.person)?.person || "";

  return (
    <AppShell
      active="companies"
      addLinks={[
        { href: `${returnTo}#edit-company`, label: "企業を編集" },
        { href: `${returnTo}#add-event`, label: "予定を追加" }
      ]}
    >
      <div className="grid gap-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm font-semibold text-brand hover:underline">
              ← 一覧へ戻る
            </Link>
            <h1 className="mt-2 text-2xl font-bold">{company?.company_name ?? "企業詳細"}</h1>
          </div>
          {company ? <Status value={company.status} /> : null}
        </div>

        {error ? (
          <Notice tone="warn" title="Google Sheetsに接続できません。">
            <p>{error}</p>
          </Notice>
        ) : null}

        {actionError ? (
          <Notice tone="danger" title="保存できませんでした。">
            <p>{actionError}</p>
          </Notice>
        ) : null}

        {company ? (
          <div className="grid gap-6">
            <section className="rounded-xl border border-line bg-card shadow-sm">
              <SectionHeader title="次アクション" description="面接前にまずここだけ見ればよい場所です。" />
              <div className="grid gap-3 px-4 pb-4 md:grid-cols-[1.4fr_1fr]">
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                  <p className="text-sm font-semibold text-blue-700">{nextActionText(company, events)}</p>
                  <p className="mt-1 text-xs text-blue-700/80">
                    {nextEvent ? eventDetailLine(nextEvent) : "イベント追加から次の予定を登録できます。"}
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-slate-50 px-4 py-3 text-sm">
                  <p className="font-semibold">担当者</p>
                  <p className="mt-1 text-slate-600">{contactPerson || "未設定"}</p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-line bg-card shadow-sm">
              <SectionHeader title="企業基本情報" description="応募媒体、URL、状態を素早く確認します。" />
              <div className="grid gap-px border-t border-line bg-line md:grid-cols-2">
                <Info label="企業名" value={company.company_name} />
                <Info label="業界" value={company.industry || "未設定"} />
                <Info label="応募媒体" value={company.application_source || "未設定"} />
                <Info label="企業/採用URL" value={company.mypage_url || "未設定"} href={company.mypage_url} />
                <Info label="担当者名" value={contactPerson || "未設定"} />
                <Info label="ステータス" value={company.status || "未設定"} />
                <Info label="イベント数" value={`${events.length}件`} />
              </div>
            </section>

            <section className="rounded-xl border border-line bg-card shadow-sm">
              <SectionHeader title="選考タイムライン" description="完了済み、予定、落選/辞退の流れを追えます。" />
              <div className="px-4 pb-4">
                {events.length ? (
                  <ol className="border-l border-line">
                    {events.map((event) => (
                      <TimelineItem key={event.event_id} event={event} />
                    ))}
                  </ol>
                ) : (
                  <p className="border-t border-line py-4 text-sm text-slate-500">イベントはまだありません。</p>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-line bg-card shadow-sm">
              <SectionHeader title="メモ" description="前回話したこと、気になる点、準備メモを置きます。" />
              <div className="border-t border-line px-4 py-4 text-sm leading-6 text-slate-700">
                {company.memo || "企業メモは未設定です。"}
              </div>
            </section>

            <section id="edit-company" className="rounded-xl border border-line bg-card shadow-sm">
              <SectionHeader title="編集" description="このページ内で企業情報と選考イベントを更新できます。" />
              <details className="border-t border-line">
                <summary className="px-4 py-3 text-sm font-semibold hover:bg-slate-50">企業編集</summary>
                <CompanyEditForm
                  company={company}
                  applicationSources={applicationSources}
                  returnTo={returnTo}
                />
              </details>
              <details id="add-event" className="border-t border-line">
                <summary className="px-4 py-3 text-sm font-semibold hover:bg-slate-50">イベント追加</summary>
                <EventCreateForm
                  company={company}
                  eventTypeOptions={eventTypeChoices}
                  returnTo={returnTo}
                />
              </details>
              <div className="border-t border-line">
                <div className="px-4 py-3 text-sm font-semibold">イベント一覧・編集</div>
                {events.length ? (
                  events.map((event) => (
                    <EventEditRow
                      key={event.event_id}
                      event={event}
                      company={company}
                      companies={companies}
                      eventTypeOptions={eventTypeChoices}
                      returnTo={returnTo}
                    />
                  ))
                ) : (
                  <p className="px-4 pb-4 text-sm text-slate-500">編集できるイベントはまだありません。</p>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function nextActionText(company: Company, events: SheetRow<JobEvent>[]) {
  if (isInactiveStatus(company.status)) {
    return `次：${company.status}`;
  }

  const event = nextEventForCompany(company, events);

  if (!event) {
    return "次の予定は未設定";
  }

  const date = eventDate(event);
  const kind = eventKindLabel(event.event_type);

  if (!date) {
    return `次：日付未設定 ${kind}`;
  }

  if (isDeadlineEvent(event.event_type)) {
    return `${kind}締切まで${relativeDayLabel(date)}`;
  }

  return `次：${eventScheduleLabel(event)} ${kind}`;
}

function eventDetailLine(event: JobEvent) {
  const place = event.meeting_url ? "オンライン" : "場所未設定";
  const person = event.person ? ` / 担当: ${event.person}` : "";
  return `${event.title || event.event_type}（${place}${person}）`;
}

function TimelineItem({ event }: { event: JobEvent }) {
  const inactive = isInactiveStatus(event.status);
  const done = event.status === "通過" || event.status === "内定";

  return (
    <li className={`relative ml-4 border-b border-line py-3 pl-5 last:border-b-0 ${inactive ? "opacity-55" : ""}`}>
      <span className={`absolute -left-[7px] top-4 h-3 w-3 border ${done ? "border-emerald-400 bg-emerald-200" : inactive ? "border-slate-300 bg-slate-200" : "border-brand bg-blue-100"}`} />
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge value={eventKindLabel(event.event_type)} tone={eventTypeTone(event.event_type)} />
            <Status value={event.status} />
            <span className="text-sm font-semibold">{event.title || event.event_type}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{eventScheduleLabel(event)}</p>
        </div>
        <p className="text-sm text-slate-500">{event.meeting_url || event.person || ""}</p>
      </div>
      {event.memo ? <p className="mt-2 text-sm leading-6 text-slate-600">{event.memo}</p> : null}
    </li>
  );
}

function CompanyEditForm({
  company,
  applicationSources,
  returnTo
}: {
  company: Company;
  applicationSources: string[];
  returnTo: string;
}) {
  return (
    <form action={updateCompany} className="grid gap-3 bg-slate-50 p-4 md:grid-cols-2">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="company_id" value={company.company_id} />
      <input type="hidden" name="timezone" value="Asia/Tokyo" />
      <Field label="企業名"><input name="company_name" required defaultValue={company.company_name} /></Field>
      <Field label="業界"><input name="industry" defaultValue={company.industry} /></Field>
      <Field label="ステータス"><Select name="status" options={companyStatuses} defaultValue={company.status} /></Field>
      <Field label="応募媒体"><DatalistInput name="application_source" options={applicationSources} defaultValue={company.application_source} /></Field>
      <Field label="企業/採用URL"><input name="mypage_url" type="url" defaultValue={company.mypage_url} /></Field>
      <Field label="メモ"><input name="memo" defaultValue={company.memo} /></Field>
      <div className="flex items-end"><PrimaryButton>企業情報を保存</PrimaryButton></div>
    </form>
  );
}

function EventCreateForm({
  company,
  eventTypeOptions,
  returnTo
}: {
  company: Company;
  eventTypeOptions: string[];
  returnTo: string;
}) {
  const defaultType = eventTypeOptions[0] ?? "";

  return (
    <form action={createEvent} className="grid gap-3 bg-slate-50 p-4 md:grid-cols-2">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="company_id" value={company.company_id} />
      <Field label="選考区分"><Select name="selection_type" options={eventSelectionTypes} defaultValue="本選考" /></Field>
      <Field label="イベント種別"><Select name="event_type" options={eventTypeOptions} defaultValue={defaultType} /></Field>
      <Field label="サブ種別/タイトル"><input name="title" placeholder="一次面接" /></Field>
      <Field label="開始日時"><input name="start_datetime" type="datetime-local" step={300} defaultValue={defaultStartDatetimeLocal()} /></Field>
      <Field label="終了日時"><input name="end_datetime" type="datetime-local" step={300} defaultValue={addMinutesLocal(defaultStartDatetimeLocal(), 60)} /></Field>
      <Field label="期間イベント"><Select name="is_period" options={["false", "true"]} /></Field>
      <Field label="期間終了日"><input name="period_end_date" type="date" /></Field>
      <Field label="ステータス"><Select name="status" options={eventStatuses} /></Field>
      <Field label="担当者"><input name="person" /></Field>
      <Field label="場所 / URL"><input name="meeting_url" type="url" placeholder="https://" /></Field>
      <Field label="メモ"><input name="memo" /></Field>
      <div className="md:col-span-2">
        <CalendarSyncCheckbox defaultChecked={defaultCalendarSyncForEventType(defaultType)} />
      </div>
      <div className="md:col-span-2"><PrimaryButton>イベントを追加</PrimaryButton></div>
    </form>
  );
}

function EventEditRow({
  event,
  company,
  companies,
  eventTypeOptions,
  returnTo
}: {
  event: SheetRow<JobEvent>;
  company: Company;
  companies: SheetRow<Company>[];
  eventTypeOptions: string[];
  returnTo: string;
}) {
  return (
    <details className="border-t border-line">
      <summary className="grid list-none grid-cols-[1fr_1fr_0.8fr_6rem] px-4 py-3 text-sm hover:bg-slate-50">
        <span className="font-semibold">{event.title || event.event_type}</span>
        <span>{eventScheduleLabel(event)}</span>
        <Status value={event.status} />
        <span>編集</span>
      </summary>
      <form action={updateEvent} className="grid gap-3 bg-slate-50 p-4 md:grid-cols-2">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="event_id" value={event.event_id} />
        <input type="hidden" name="timezone" value={event.timezone || "Asia/Tokyo"} />
        <Field label="企業"><CompanySelect companies={companies} defaultValue={company.company_id} /></Field>
        <Field label="選考区分"><Select name="selection_type" options={eventSelectionTypes} defaultValue={event.selection_type || "本選考"} /></Field>
        <Field label="イベント種別"><Select name="event_type" options={eventTypeOptions} defaultValue={event.event_type} /></Field>
        <Field label="サブ種別/タイトル"><input name="title" defaultValue={event.title} /></Field>
        <Field label="開始日時"><input name="start_datetime" type="datetime-local" step={300} defaultValue={toDatetimeLocal(event.start_datetime)} /></Field>
        <Field label="終了日時"><input name="end_datetime" type="datetime-local" step={300} defaultValue={toDatetimeLocal(event.end_datetime)} /></Field>
        <Field label="期間イベント"><Select name="is_period" options={["false", "true"]} defaultValue={event.is_period || "false"} /></Field>
        <Field label="期間終了日"><input name="period_end_date" type="date" defaultValue={event.period_end_date} /></Field>
        <Field label="ステータス"><Select name="status" options={eventStatuses} defaultValue={event.status} /></Field>
        <Field label="担当者"><input name="person" defaultValue={event.person} /></Field>
        <Field label="場所 / URL"><input name="meeting_url" type="url" defaultValue={event.meeting_url} /></Field>
        <Field label="メモ"><input name="memo" defaultValue={event.memo} /></Field>
        <div className="md:col-span-2">
          <CalendarSyncCheckbox defaultChecked={event.sync_to_calendar === "true"} />
        </div>
        <div className="flex gap-2 md:col-span-2">
          <PrimaryButton>イベントを保存</PrimaryButton>
        </div>
      </form>
      <form action={deleteEvent} className="bg-slate-50 px-4 pb-4 text-right">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="event_id" value={event.event_id} />
        <DangerButton>イベントを削除</DangerButton>
      </form>
    </details>
  );
}

function Notice({
  tone,
  title,
  children
}: {
  tone: "warn" | "danger";
  title: string;
  children: React.ReactNode;
}) {
  const className = tone === "danger"
    ? "border-red-200 bg-red-50 text-red-800"
    : "border-amber-300 bg-amber-50 text-amber-900";

  return (
    <section className={`rounded-xl border p-4 text-sm shadow-sm ${className}`}>
      <p className="font-semibold">{title}</p>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function Info({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      {href ? (
        <a className="mt-1 block truncate text-sm font-semibold text-brand hover:underline" href={href} target="_blank" rel="noreferrer">
          {value}
        </a>
      ) : (
        <p className="mt-1 text-sm font-semibold">{value}</p>
      )}
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Select({
  name,
  options,
  defaultValue
}: {
  name: string;
  options: readonly string[];
  defaultValue?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function CalendarSyncCheckbox({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-600">
      <input type="hidden" name="sync_to_calendar" value="false" />
      <input
        name="sync_to_calendar"
        type="checkbox"
        value="true"
        defaultChecked={defaultChecked}
        className="h-4 w-4 accent-brand"
      />
      Google Calendar同期
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
  defaultValue
}: {
  name: string;
  options: string[];
  defaultValue?: string;
}) {
  const listId = `${name}-options`;

  return (
    <>
      <input name={name} list={listId} defaultValue={defaultValue} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return <Button tone="primary" className="w-full">{children}</Button>;
}

function DangerButton({ children }: { children: React.ReactNode }) {
  return <Button tone="danger">{children}</Button>;
}

function Status({ value }: { value: string }) {
  return <Badge className={statusTone(value)}>{value || "-"}</Badge>;
}

function TypeBadge({ value, tone }: { value: string; tone: string }) {
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${tone}`}>
      {value || "その他"}
    </span>
  );
}

function toDatetimeLocal(value: string) {
  return value ? value.replace(" ", "T").slice(0, 16) : "";
}

function defaultStartDatetimeLocal() {
  const date = new Date();
  const minutes = date.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 5) * 5;
  date.setSeconds(0, 0);
  date.setMinutes(roundedMinutes);
  return toDatetimeLocalValue(date);
}

function addMinutesLocal(value: string, minutes: number) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  date.setMinutes(date.getMinutes() + minutes);
  return toDatetimeLocalValue(date);
}

function toDatetimeLocalValue(value: Date) {
  const pad = (item: number) => String(item).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
