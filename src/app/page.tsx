import {
  createCompany,
  createEvent,
  createSetting,
  deleteCompany,
  deleteEvent,
  deleteSetting,
  updateCompany,
  updateEvent,
  updateSetting
} from "@/lib/actions";
import { listSheetRows, type SheetRow } from "@/lib/google-sheets";
import type { Company } from "@/types/company";
import { companyCategories, companyStatuses } from "@/types/company";
import type { JobEvent } from "@/types/event";
import { eventStatuses } from "@/types/event";
import type { Setting } from "@/types/settings";

export const dynamic = "force-dynamic";

type PageData = {
  companies: SheetRow<Company>[];
  events: SheetRow<JobEvent>[];
  settings: SheetRow<Setting>[];
  error: string | null;
};

async function getPageData(): Promise<PageData> {
  try {
    const [companies, events, settings] = await Promise.all([
      listSheetRows<Company>("companies"),
      listSheetRows<JobEvent>("events"),
      listSheetRows<Setting>("settings")
    ]);

    return { companies, events, settings, error: null };
  } catch (error) {
    return {
      companies: [],
      events: [],
      settings: [],
      error: error instanceof Error ? error.message : "Google Sheets connection failed"
    };
  }
}

export default async function Home() {
  const { companies, events, settings, error } = await getPageData();
  const applicationSources = settings
    .filter((setting) => setting.group === "application_source")
    .sort(bySortOrder)
    .map((setting) => setting.value);
  const eventTypes = settings
    .filter((setting) => setting.group === "main_category")
    .sort(bySortOrder)
    .map((setting) => setting.value);

  return (
    <main className="min-h-screen px-5 py-6 text-ink md:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-6 flex flex-col gap-3 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-brand">Job Hunt Note / Phase1</p>
            <h1 className="mt-1 text-3xl font-bold tracking-normal">Google Sheets CRUD</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              横軸タイムラインへ進む前の基盤画面です。companies / events / settings をSheets上で確認・編集します。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <Metric label="companies" value={companies.length} />
            <Metric label="events" value={events.length} />
            <Metric label="settings" value={settings.length} />
          </div>
        </header>

        {error ? (
          <section className="mb-6 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Google Sheetsに接続できません。</p>
            <p className="mt-1">
              `.env.local` に `GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`
              を設定し、対象シートをサービスアカウントへ共有してください。
            </p>
            <p className="mt-2 font-mono text-xs">{error}</p>
          </section>
        ) : (
          <section className="mb-6 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Google Sheets接続済み。読み書き対象は companies / events / settings シートです。
          </section>
        )}

        <div className="grid gap-6">
          <CompaniesSection
            companies={companies}
            applicationSources={applicationSources}
          />
          <EventsSection
            companies={companies}
            events={events}
            eventTypes={eventTypes}
          />
          <SettingsSection settings={settings} />
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-line bg-white/80 px-4 py-3">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function CompaniesSection({
  companies,
  applicationSources
}: {
  companies: SheetRow<Company>[];
  applicationSources: string[];
}) {
  return (
    <section className="border border-line bg-white/90">
      <SectionHeader title="companies" description="企業マスタ。Phase2のタイムライン縦軸になります。" />
      <div className="overflow-x-auto">
        <div className="min-w-[1120px]">
          <div className="grid grid-cols-[1.6fr_0.9fr_0.9fr_0.9fr_1fr_0.7fr_1.4fr_1.6fr_9rem] border-y border-line bg-slate-50 text-xs font-semibold text-slate-600">
            <Cell>企業名</Cell>
            <Cell>カテゴリ</Cell>
            <Cell>業界</Cell>
            <Cell>ステータス</Cell>
            <Cell>応募媒体</Cell>
            <Cell>順序</Cell>
            <Cell>マイページ</Cell>
            <Cell>メモ</Cell>
            <Cell>操作</Cell>
          </div>
          <form action={createCompany} className="grid grid-cols-[1.6fr_0.9fr_0.9fr_0.9fr_1fr_0.7fr_1.4fr_1.6fr_9rem] border-b border-line bg-blue-50/50">
            <Cell><input name="company_name" required placeholder="企業名" /></Cell>
            <Cell><Select name="category" options={companyCategories} /></Cell>
            <Cell><input name="industry" placeholder="IT" /></Cell>
            <Cell><Select name="status" options={companyStatuses} /></Cell>
            <Cell><DatalistInput name="recruitment_source" options={applicationSources} placeholder="OfferBox" /></Cell>
            <Cell><input name="order_index" inputMode="numeric" placeholder="10" /></Cell>
            <Cell><input name="mypage_url" type="url" placeholder="https://" /></Cell>
            <Cell><input name="memo" placeholder="メモ" /></Cell>
            <Cell><PrimaryButton>追加</PrimaryButton></Cell>
          </form>
          {companies.map((company) => (
            <details key={company.company_id} className="border-b border-line">
              <summary className="grid grid-cols-[1.6fr_0.9fr_0.9fr_0.9fr_1fr_0.7fr_1.4fr_1.6fr_9rem] list-none hover:bg-slate-50">
                <Cell strong>{company.company_name}</Cell>
                <Cell>{company.category}</Cell>
                <Cell>{company.industry || "-"}</Cell>
                <Cell><Status value={company.status} /></Cell>
                <Cell>{company.recruitment_source || "-"}</Cell>
                <Cell>{company.order_index || "-"}</Cell>
                <Cell>{company.mypage_url || "-"}</Cell>
                <Cell>{company.memo || "-"}</Cell>
                <Cell>編集</Cell>
              </summary>
              <form action={updateCompany} className="grid grid-cols-[1.6fr_0.9fr_0.9fr_0.9fr_1fr_0.7fr_1.4fr_1.6fr_9rem] bg-slate-50">
                <input type="hidden" name="_rowNumber" value={company._rowNumber} />
                <input type="hidden" name="company_id" value={company.company_id} />
                <input type="hidden" name="created_at" value={company.created_at} />
                <Cell><input name="company_name" required defaultValue={company.company_name} /></Cell>
                <Cell><Select name="category" options={companyCategories} defaultValue={company.category} /></Cell>
                <Cell><input name="industry" defaultValue={company.industry} /></Cell>
                <Cell><Select name="status" options={companyStatuses} defaultValue={company.status} /></Cell>
                <Cell><DatalistInput name="recruitment_source" options={applicationSources} defaultValue={company.recruitment_source} /></Cell>
                <Cell><input name="order_index" defaultValue={company.order_index} /></Cell>
                <Cell><input name="mypage_url" type="url" defaultValue={company.mypage_url} /></Cell>
                <Cell><input name="memo" defaultValue={company.memo} /></Cell>
                <Cell><PrimaryButton>保存</PrimaryButton></Cell>
              </form>
              <form action={deleteCompany} className="bg-slate-50 px-3 pb-3 text-right">
                <input type="hidden" name="_rowNumber" value={company._rowNumber} />
                <DangerButton>削除</DangerButton>
              </form>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function EventsSection({
  companies,
  events,
  eventTypes
}: {
  companies: SheetRow<Company>[];
  events: SheetRow<JobEvent>[];
  eventTypes: string[];
}) {
  const eventTypeOptions = eventTypes.length ? eventTypes : ["ES", "Webテスト", "適性検査", "面接", "GD", "インターン", "説明会", "その他"];

  return (
    <section className="border border-line bg-white/90">
      <SectionHeader title="events" description="選考・予定。end_datetime未入力時、面接/面談は60分で補完します。" />
      <div className="overflow-x-auto">
        <div className="min-w-[1240px]">
          <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr_1fr_0.7fr_1fr_0.9fr_1fr_1.2fr_9rem] border-y border-line bg-slate-50 text-xs font-semibold text-slate-600">
            <Cell>企業</Cell>
            <Cell>種別</Cell>
            <Cell>タイトル</Cell>
            <Cell>開始</Cell>
            <Cell>終了</Cell>
            <Cell>期間</Cell>
            <Cell>期間終了</Cell>
            <Cell>状態</Cell>
            <Cell>担当</Cell>
            <Cell>URL/メモ</Cell>
            <Cell>操作</Cell>
          </div>
          <form action={createEvent} className="grid grid-cols-[1.1fr_1fr_1fr_1fr_1fr_0.7fr_1fr_0.9fr_1fr_1.2fr_9rem] border-b border-line bg-blue-50/50">
            <Cell><CompanySelect companies={companies} /></Cell>
            <Cell><Select name="event_type" options={eventTypeOptions} /></Cell>
            <Cell><input name="title" placeholder="一次面接" /></Cell>
            <Cell><input name="start_datetime" type="datetime-local" /></Cell>
            <Cell><input name="end_datetime" type="datetime-local" /></Cell>
            <Cell><Select name="is_period" options={["false", "true"]} /></Cell>
            <Cell><input name="period_end_date" type="date" /></Cell>
            <Cell><Select name="status" options={eventStatuses} /></Cell>
            <Cell><input name="person" placeholder="担当者" /></Cell>
            <Cell>
              <div className="grid gap-1">
                <input name="meeting_url" type="url" placeholder="https://" />
                <input name="memo" placeholder="メモ" />
              </div>
            </Cell>
            <Cell><PrimaryButton disabled={!companies.length}>追加</PrimaryButton></Cell>
          </form>
          {events.map((event) => (
            <details key={event.event_id} className="border-b border-line">
              <summary className="grid grid-cols-[1.1fr_1fr_1fr_1fr_1fr_0.7fr_1fr_0.9fr_1fr_1.2fr_9rem] list-none hover:bg-slate-50">
                <Cell>{companyName(companies, event.company_id)}</Cell>
                <Cell strong>{event.event_type}</Cell>
                <Cell>{event.title || "-"}</Cell>
                <Cell>{event.start_datetime || "-"}</Cell>
                <Cell>{event.end_datetime || "-"}</Cell>
                <Cell>{event.is_period || "false"}</Cell>
                <Cell>{event.period_end_date || "-"}</Cell>
                <Cell><Status value={event.status} /></Cell>
                <Cell>{event.person || "-"}</Cell>
                <Cell>{event.meeting_url || event.memo || "-"}</Cell>
                <Cell>編集</Cell>
              </summary>
              <form action={updateEvent} className="grid grid-cols-[1.1fr_1fr_1fr_1fr_1fr_0.7fr_1fr_0.9fr_1fr_1.2fr_9rem] bg-slate-50">
                <input type="hidden" name="_rowNumber" value={event._rowNumber} />
                <input type="hidden" name="event_id" value={event.event_id} />
                <input type="hidden" name="google_calendar_created" value={event.google_calendar_created} />
                <input type="hidden" name="google_calendar_event_ids" value={event.google_calendar_event_ids} />
                <input type="hidden" name="google_event_id" value={event.google_event_id} />
                <input type="hidden" name="created_at" value={event.created_at} />
                <Cell><CompanySelect companies={companies} defaultValue={event.company_id} /></Cell>
                <Cell><Select name="event_type" options={eventTypeOptions} defaultValue={event.event_type} /></Cell>
                <Cell><input name="title" defaultValue={event.title} /></Cell>
                <Cell><input name="start_datetime" type="datetime-local" defaultValue={toDatetimeLocal(event.start_datetime)} /></Cell>
                <Cell><input name="end_datetime" type="datetime-local" defaultValue={toDatetimeLocal(event.end_datetime)} /></Cell>
                <Cell><Select name="is_period" options={["false", "true"]} defaultValue={event.is_period || "false"} /></Cell>
                <Cell><input name="period_end_date" type="date" defaultValue={event.period_end_date} /></Cell>
                <Cell><Select name="status" options={eventStatuses} defaultValue={event.status} /></Cell>
                <Cell><input name="person" defaultValue={event.person} /></Cell>
                <Cell>
                  <div className="grid gap-1">
                    <input name="meeting_url" type="url" defaultValue={event.meeting_url} />
                    <input name="memo" defaultValue={event.memo} />
                  </div>
                </Cell>
                <Cell><PrimaryButton>保存</PrimaryButton></Cell>
              </form>
              <form action={deleteEvent} className="bg-slate-50 px-3 pb-3 text-right">
                <input type="hidden" name="_rowNumber" value={event._rowNumber} />
                <DangerButton>削除</DangerButton>
              </form>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function SettingsSection({ settings }: { settings: SheetRow<Setting>[] }) {
  return (
    <section className="border border-line bg-white/90">
      <SectionHeader title="settings" description="イベント種別、サブカテゴリ、応募媒体の選択肢です。" />
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[1.1fr_1.1fr_1.4fr_0.7fr_9rem] border-y border-line bg-slate-50 text-xs font-semibold text-slate-600">
            <Cell>group</Cell>
            <Cell>parent</Cell>
            <Cell>value</Cell>
            <Cell>sort</Cell>
            <Cell>操作</Cell>
          </div>
          <form action={createSetting} className="grid grid-cols-[1.1fr_1.1fr_1.4fr_0.7fr_9rem] border-b border-line bg-blue-50/50">
            <Cell><input name="group" required placeholder="main_category" /></Cell>
            <Cell><input name="parent" placeholder="面接" /></Cell>
            <Cell><input name="value" required placeholder="1次" /></Cell>
            <Cell><input name="sort_order" inputMode="numeric" placeholder="10" /></Cell>
            <Cell><PrimaryButton>追加</PrimaryButton></Cell>
          </form>
          {settings.map((setting) => (
            <details key={`${setting.group}-${setting.parent}-${setting.value}-${setting._rowNumber}`} className="border-b border-line">
              <summary className="grid grid-cols-[1.1fr_1.1fr_1.4fr_0.7fr_9rem] list-none hover:bg-slate-50">
                <Cell strong>{setting.group}</Cell>
                <Cell>{setting.parent || "-"}</Cell>
                <Cell>{setting.value}</Cell>
                <Cell>{setting.sort_order || "-"}</Cell>
                <Cell>編集</Cell>
              </summary>
              <form action={updateSetting} className="grid grid-cols-[1.1fr_1.1fr_1.4fr_0.7fr_9rem] bg-slate-50">
                <input type="hidden" name="_rowNumber" value={setting._rowNumber} />
                <Cell><input name="group" required defaultValue={setting.group} /></Cell>
                <Cell><input name="parent" defaultValue={setting.parent} /></Cell>
                <Cell><input name="value" required defaultValue={setting.value} /></Cell>
                <Cell><input name="sort_order" defaultValue={setting.sort_order} /></Cell>
                <Cell><PrimaryButton>保存</PrimaryButton></Cell>
              </form>
              <form action={deleteSetting} className="bg-slate-50 px-3 pb-3 text-right">
                <input type="hidden" name="_rowNumber" value={setting._rowNumber} />
                <DangerButton>削除</DangerButton>
              </form>
            </details>
          ))}
        </div>
      </div>
    </section>
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

function Cell({
  children,
  strong = false
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className={`min-w-0 border-r border-line px-3 py-2 text-sm last:border-r-0 ${strong ? "font-semibold" : ""}`}>
      <div className="truncate">{children}</div>
    </div>
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

function CompanySelect({
  companies,
  defaultValue
}: {
  companies: SheetRow<Company>[];
  defaultValue?: string;
}) {
  return (
    <select name="company_id" required defaultValue={defaultValue}>
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
  const listId = `${name}-options`;

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

function PrimaryButton({
  children,
  disabled = false
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full bg-brand px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      {children}
    </button>
  );
}

function DangerButton({ children }: { children: React.ReactNode }) {
  return (
    <button type="submit" className="border border-red-200 bg-white px-3 py-2 font-semibold text-red-600">
      {children}
    </button>
  );
}

function Status({ value }: { value: string }) {
  return (
    <span className="inline-flex border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
      {value || "-"}
    </span>
  );
}

function companyName(companies: SheetRow<Company>[], companyId: string) {
  return companies.find((company) => company.company_id === companyId)?.company_name ?? companyId;
}

function bySortOrder(a: Setting, b: Setting) {
  return Number(a.sort_order || 0) - Number(b.sort_order || 0);
}

function toDatetimeLocal(value: string) {
  return value ? value.replace(" ", "T").slice(0, 16) : "";
}
