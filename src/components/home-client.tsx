"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ClientViewShell, type ClientAppView } from "@/components/client-view-shell";
import { EditEntityButton } from "@/components/edit-entity-button";
import {
  useLocalCompanyDrafts,
  useLocalCompanyUpdates,
  useLocalEventDrafts,
  useLocalEventUpdates,
  type LocalCompanyDraft,
  type LocalCompanyUpdateDraft,
  type LocalEventDraft,
  type LocalEventUpdateDraft
} from "@/components/local-draft-sync-panel";
import { TimelineEventOpenButton } from "@/components/timeline-event-open-button";
import { TimelineInitialScroll } from "@/components/timeline-initial-scroll";
import { Badge } from "@/components/ui/badge";
import { Card, SectionHeader } from "@/components/ui/card";
import { defaultTimeZone } from "@/lib/datetime";
import type { SheetRow } from "@/lib/google-sheets";
import {
  createSettingFromHome,
  deleteCompanyFromHome,
  deleteEventFromHome,
  deleteSettingFromHome,
  updateSettingFromHome
} from "@/lib/home-actions";
import {
  eventDate,
  eventKindLabel,
  eventScheduleLabel,
  eventTextTone,
  eventTypeTone,
  groupEventsByPeriod,
  isInactiveStatus,
  nextActionLabel,
  sortCompaniesForTimeline,
  sortEventsBySchedule,
  statusTone
} from "@/lib/planning";
import { toSettingRecord } from "@/lib/records";
import type { Company } from "@/types/company";
import type { JobEvent } from "@/types/event";
import type { Setting } from "@/types/settings";

const AddEntityActions = dynamic(
  () => import("@/components/add-entity-actions").then((mod) => mod.AddEntityActions),
  { ssr: false }
);
const CalendarMonthView = dynamic(
  () => import("@/components/calendar-month-view").then((mod) => mod.CalendarMonthView),
  { ssr: false, loading: () => <div className="h-full rounded-xl border border-line bg-white" /> }
);
const CompanyDraftEditSidebar = dynamic(
  () => import("@/components/edit-draft-sidebars").then((mod) => mod.CompanyDraftEditSidebar),
  { ssr: false }
);
const EventDraftEditSidebar = dynamic(
  () => import("@/components/edit-draft-sidebars").then((mod) => mod.EventDraftEditSidebar),
  { ssr: false }
);
const GoogleCalendarConnectionCard = dynamic(
  () => import("@/components/google-calendar-connection-card").then((mod) => mod.GoogleCalendarConnectionCard),
  { ssr: false, loading: () => <Card><SectionHeader title="Google Calendar" description="接続状態を確認しています。" /></Card> }
);
const LocalDraftSyncPanel = dynamic(
  () => import("@/components/local-draft-sync-panel").then((mod) => mod.LocalDraftSyncPanel),
  { ssr: false }
);
const TimelineEventPopoverLayer = dynamic(
  () => import("@/components/timeline-event-popover").then((mod) => mod.TimelineEventPopoverLayer),
  { ssr: false }
);

type HomeClientProps = {
  initialView: ClientAppView;
  companies: SheetRow<Company>[];
  events: SheetRow<JobEvent>[];
  settings: SheetRow<Setting>[];
  error: string | null;
  actionError?: string;
  monthParam?: string;
};

type EditTarget =
  | { type: "event"; id: string }
  | { type: "company"; id: string };

export function HomeClient({
  initialView,
  companies: initialCompanies,
  events: initialEvents,
  settings: initialSettings,
  error,
  actionError,
  monthParam
}: HomeClientProps) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [events, setEvents] = useState(initialEvents);
  const [settings, setSettings] = useState(initialSettings);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [detailCompanyId, setDetailCompanyId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const hasInitialSnapshot = initialCompanies.length > 0 || initialEvents.length > 0 || initialSettings.length > 0;
  const localEventDrafts = useLocalEventDrafts();
  const localCompanyDrafts = useLocalCompanyDrafts();
  const localEventUpdates = useLocalEventUpdates();
  const localCompanyUpdates = useLocalCompanyUpdates();

  useEffect(() => {
    if (hasInitialSnapshot) {
      return;
    }

    const controller = new AbortController();

    fetch("/api/sheets/cache", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as {
          companies?: SheetRow<Company>[];
          events?: SheetRow<JobEvent>[];
          settings?: SheetRow<Setting>[];
          error?: string | null;
        };

        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? "Google Sheets connection failed");
        }

        setCompanies(payload.companies ?? []);
        setEvents(payload.events ?? []);
        setSettings(payload.settings ?? []);
        setSyncError(null);

        const hasCachedRows = Boolean((payload.companies?.length ?? 0) + (payload.events?.length ?? 0) + (payload.settings?.length ?? 0));
        if (!hasCachedRows) {
          return fetch("/api/sheets/snapshot?fresh=1", { cache: "no-store", signal: controller.signal });
        }

        return null;
      })
      .then(async (response) => {
        if (!response) return;
        const payload = await response.json() as {
          companies?: SheetRow<Company>[];
          events?: SheetRow<JobEvent>[];
          settings?: SheetRow<Setting>[];
          error?: string | null;
        };

        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? "Google Sheets connection failed");
        }

        setCompanies(payload.companies ?? []);
        setEvents(payload.events ?? []);
        setSettings(payload.settings ?? []);
        setSyncError(null);
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setSyncError(fetchError instanceof Error ? fetchError.message : "Google Sheets connection failed");
      });

    return () => controller.abort();
  }, [hasInitialSnapshot]);

  useEffect(() => {
    function onOpenCompanyDetail(event: Event) {
      const companyId = (event as CustomEvent<{ companyId?: string }>).detail?.companyId;
      if (companyId) {
        setDetailCompanyId(companyId);
      }
    }

    window.addEventListener("job-hunt-note:company-detail-open", onOpenCompanyDetail);
    return () => window.removeEventListener("job-hunt-note:company-detail-open", onOpenCompanyDetail);
  }, []);

  const openCompanyKarte = useCallback((companyId: string) => {
    setDetailCompanyId(null);
    window.dispatchEvent(new CustomEvent("job-hunt-note:company-karte-open", { detail: { companyId } }));
  }, []);

  useEffect(() => {
    function onEdit(event: Event) {
      const detail = (event as CustomEvent<EditTarget>).detail;
      if (detail?.type === "event" || detail?.type === "company") {
        setEditTarget(detail);
      }
    }

    window.addEventListener("job-hunt-note:edit", onEdit);
    return () => window.removeEventListener("job-hunt-note:edit", onEdit);
  }, []);

  const applicationSources = useMemo(
    () => settings
      .filter((setting) => setting.group === "application_source")
      .sort(bySortOrder)
      .map((setting) => setting.value),
    [settings]
  );
  const eventTypes = useMemo(
    () => settings
      .filter((setting) => setting.group === "main_category")
      .sort(bySortOrder)
      .map((setting) => setting.value),
    [settings]
  );
  const eventTypeOptions = eventTypes.length
    ? eventTypes
    : ["ES", "Webテスト", "適性検査", "面接", "GD", "インターン", "説明会", "その他"];
  const legacyTimeZone = useMemo(() => settings.find((setting) => setting.group === "timezone")?.value, [settings]);
  const eventDefaultTimeZone = useMemo(() => settings.find((setting) => setting.group === "event_default_timezone")?.value || legacyTimeZone || defaultTimeZone, [legacyTimeZone, settings]);
  const uiDefaultTimeZone = useMemo(() => settings.find((setting) => setting.group === "ui_default_timezone")?.value || legacyTimeZone || defaultTimeZone, [legacyTimeZone, settings]);
  const visibleCompanies = useMemo(
    () => mergeLocalCompanies(companies, localCompanyDrafts, localCompanyUpdates),
    [companies, localCompanyDrafts, localCompanyUpdates]
  );
  const visibleEvents = useMemo(
    () => mergeLocalEvents(events, localEventDrafts, localEventUpdates),
    [events, localEventDrafts, localEventUpdates]
  );
  const eventBuckets = useMemo(() => groupEventsByPeriod(visibleEvents, new Date(), uiDefaultTimeZone), [visibleEvents, uiDefaultTimeZone]);
  const visibleError = error ?? syncError;
  const detailCompany = detailCompanyId ? visibleCompanies.find((company) => company.company_id === detailCompanyId) : null;
  const detailCompanyEvents = useMemo(
    () => detailCompanyId ? sortEventsBySchedule(visibleEvents.filter((event) => event.company_id === detailCompanyId), uiDefaultTimeZone) : [],
    [detailCompanyId, visibleEvents, uiDefaultTimeZone]
  );
  const editingEvent = editTarget?.type === "event" ? visibleEvents.find((event) => event.event_id === editTarget.id) : undefined;
  const editingCompany = editTarget?.type === "company" ? visibleCompanies.find((company) => company.company_id === editTarget.id) : undefined;
  const editRightPanel = editingEvent ? (
    <EventDraftEditSidebar
      event={editingEvent}
      companies={visibleCompanies}
      eventTypeOptions={eventTypeOptions}
      timeZone={eventDefaultTimeZone}
      closeHref="#"
      onClose={() => setEditTarget(null)}
    />
  ) : editingCompany ? (
    <CompanyDraftEditSidebar
      company={editingCompany}
      applicationSources={applicationSources}
      closeHref="#"
      onClose={() => setEditTarget(null)}
    />
  ) : null;

  const notices = (
    <>
      {visibleError ? (
        <Notice tone="warn" title="Google Sheetsに接続できません。">
          <p>
            `.env.local` に `GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` を設定し、
            対象シートをサービスアカウントへ共有してください。
          </p>
          <p className="mt-2 font-mono text-xs">{visibleError}</p>
        </Notice>
      ) : null}

      {actionError ? (
        <Notice tone="danger" title="保存できませんでした。">
          <p>{actionError}</p>
        </Notice>
      ) : null}
    </>
  );

  return (
    <ClientViewShell
      initialView={initialView}
      notices={notices}
      rightPanel={editRightPanel}
      views={{
        dashboard: {
          title: "ダッシュボード",
          description: "今何が起きていて、次に何をするべきかを確認します。",
          content: <DashboardView companies={visibleCompanies} events={visibleEvents} timeZone={uiDefaultTimeZone} onOpenCompanyDetail={openCompanyKarte} />
        },
        calendar: {
          title: "カレンダー",
          description: "日付ベースで、面接・締切・説明会などの予定を管理します。",
          content: (
            <CalendarMonthView
              companies={visibleCompanies}
              events={visibleEvents}
              monthParam={monthParam}
              timeZone={uiDefaultTimeZone}
            />
          )
        },
        companies: {
          title: "企業",
          description: "応募中の企業、選考状態、メモ、選考イベントを管理します。",
          content: <CompaniesView companies={visibleCompanies} events={visibleEvents} eventBuckets={eventBuckets} timeZone={uiDefaultTimeZone} />
        },
        stats: {
          title: "統計",
          description: "応募数、通過率、業界や応募経路の傾向を振り返ります。",
          content: <StatsView companies={visibleCompanies} events={visibleEvents} />
        },
        settings: {
          title: "設定",
          description: "選択肢や連携設定など、アプリ全体の設定を管理します。",
          content: (
            <SettingsView
              settings={settings}
              companies={visibleCompanies}
              events={visibleEvents}
              eventTimeZone={eventDefaultTimeZone}
              uiTimeZone={uiDefaultTimeZone}
            />
          )
        }
      }}
      overlays={
        <>
          <AddEntityActions
            companies={visibleCompanies}
            applicationSources={applicationSources}
            eventTypeOptions={eventTypeOptions}
            timeZone={eventDefaultTimeZone}
            inline={false}
            returnTo="/"
          />
          <TimelineEventPopoverLayer events={visibleEvents} companies={visibleCompanies} timeZone={uiDefaultTimeZone} />
          <LocalDraftSyncPanel companies={visibleCompanies} />
          <CompanyDetailOverlay
            company={detailCompany ?? null}
            events={detailCompanyEvents}
            timeZone={uiDefaultTimeZone}
            onClose={() => setDetailCompanyId(null)}
          />
        </>
      }
    />
  );
}

function mergeLocalCompanies(
  companies: SheetRow<Company>[],
  drafts: LocalCompanyDraft[],
  updates: LocalCompanyUpdateDraft[]
) {
  const updateById = new Map(updates.map((update) => [update.company_id, update]));
  const existingIds = new Set(companies.map((company) => company.company_id));
  const merged = companies.map((company) => {
    const update = updateById.get(company.company_id);
    return update ? {
      ...company,
      company_name: update.company_name,
      industry: update.industry,
      status: update.status,
      mypage_url: update.mypage_url,
      memo: update.memo,
      application_source: update.application_source,
      updated_at: update.created_at
    } : company;
  });
  const newDrafts = drafts
    .filter((draft) => !existingIds.has(draft.company_id))
    .map((draft) => ({
      _rowNumber: -1,
      company_id: draft.company_id,
      company_name: draft.company_name,
      industry: draft.industry,
      status: draft.status,
      recruitment_source: "",
      order_index: "0",
      mypage_url: draft.mypage_url,
      memo: draft.memo,
      created_at: draft.created_at,
      updated_at: draft.created_at,
      application_source: draft.application_source
    } satisfies SheetRow<Company>));

  return [...newDrafts, ...merged];
}

function mergeLocalEvents(
  events: SheetRow<JobEvent>[],
  drafts: LocalEventDraft[],
  updates: LocalEventUpdateDraft[]
) {
  const updateById = new Map(updates.map((update) => [update.event_id, update]));
  const existingIds = new Set(events.map((event) => event.event_id));
  const merged = events.map((event) => {
    const update = updateById.get(event.event_id);
    return update ? {
      ...event,
      company_id: update.company_id,
      selection_type: update.selection_type,
      event_type: update.event_type,
      title: update.title,
      start_datetime: update.start_datetime,
      end_datetime: update.end_datetime,
      timezone: update.timezone,
      is_period: update.is_period,
      period_end_date: update.period_end_date,
      status: update.status,
      person: update.person,
      meeting_url: update.meeting_url,
      memo: update.memo,
      sync_to_calendar: update.sync_to_calendar,
      updated_at: update.created_at
    } : event;
  });
  const newDrafts = drafts
    .filter((draft) => !existingIds.has(draft.draft_id))
    .map((draft) => ({
      _rowNumber: -1,
      event_id: draft.draft_id,
      company_id: draft.company_id,
      selection_type: draft.selection_type,
      event_type: draft.event_type,
      title: draft.title,
      start_datetime: draft.start_datetime,
      end_datetime: draft.end_datetime,
      timezone: draft.timezone,
      is_period: draft.is_period,
      period_end_date: draft.period_end_date,
      status: draft.status,
      person: draft.person,
      meeting_url: draft.meeting_url,
      memo: draft.memo,
      sync_to_calendar: draft.sync_to_calendar,
      google_calendar_event_id: "",
      calendar_last_synced_at: "",
      created_at: draft.created_at,
      updated_at: draft.created_at
    } satisfies SheetRow<JobEvent>));

  return [...merged, ...newDrafts];
}

function DashboardView({ companies, events, timeZone, onOpenCompanyDetail }: { companies: SheetRow<Company>[]; events: SheetRow<JobEvent>[]; timeZone: string; onOpenCompanyDetail: (companyId: string) => void }) {
  const buckets = groupEventsByPeriod(events, new Date(), timeZone);
  const todayEvents = buckets.find((bucket) => bucket.key === "today")?.events ?? [];
  const tomorrowEvents = buckets.find((bucket) => bucket.key === "tomorrow")?.events ?? [];
  const thisWeekEvents = buckets.find((bucket) => bucket.key === "thisWeek")?.events ?? [];
  const todayStart = startOfDay(new Date()).getTime();
  const upcomingEvents = sortEventsBySchedule(events, timeZone)
    .filter((event) => !isInactiveStatus(event.status))
    .filter((event) => {
      const date = eventDate(event, timeZone);
      return date ? startOfDay(date).getTime() >= todayStart : false;
    })
    .slice(0, 5);
  const activeCompanies = companies.filter((company) => !isInactiveStatus(company.status));
  const weekInterviews = thisWeekEvents.filter((event) => eventKindLabel(event.event_type) === "面接").length;
  const deadlines = [...todayEvents, ...tomorrowEvents, ...thisWeekEvents]
    .filter((event) => {
      const kind = eventKindLabel(event.event_type);
      return kind === "ES" || kind === "Webテスト" || kind === "適性検査";
    }).length;

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_180px] gap-3 overflow-hidden">
      <TimelineView companies={companies} events={events} timeZone={timeZone} onOpenCompanyDetail={onOpenCompanyDetail} />
      <div className="grid min-h-0 gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        <UpcomingList events={upcomingEvents} companies={companies} timeZone={timeZone} compact />
        <Card className="min-h-0 overflow-hidden">
          <div className="flex items-baseline justify-between px-4 py-3">
            <h2 className="text-base font-semibold text-ink">統計サマリー</h2>
            <span className="text-xs text-muted">現在</span>
          </div>
          <div className="grid gap-2 border-t border-line px-4 py-3 text-sm">
            <SummaryRow label="選考中" value={`${activeCompanies.length}社`} />
            <SummaryRow label="今週 面接" value={`${weekInterviews}件`} />
            <SummaryRow label="締切系" value={`${deadlines}件`} />
            <SummaryRow label="イベント総数" value={`${events.length}件`} strong />
          </div>
        </Card>
      </div>
    </div>
  );
}

function TimelineView({ companies, events, timeZone, onOpenCompanyDetail }: { companies: SheetRow<Company>[]; events: SheetRow<JobEvent>[]; timeZone: string; onOpenCompanyDetail: (companyId: string) => void }) {
  const [firstVisibleDayIndex, setFirstVisibleDayIndex] = useState(0);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const timelineHeaderRef = useRef<HTMLDivElement | null>(null);
  const companyRowsRef = useRef<HTMLDivElement | null>(null);
  const dayWidth = 54;
  const rowHeight = 44;
  const leftWidth = 196;
  const today = useMemo(() => startOfDay(new Date()), []);
  const scheduledEvents = useMemo(() => events.filter((event) => eventDate(event, timeZone)), [events, timeZone]);
  const sortedCompanies = useMemo(
    () => sortCompaniesForTimeline(companies, scheduledEvents).slice(0, Math.max(8, companies.length)),
    [companies, scheduledEvents]
  );
  const selectedCompany = useMemo(
    () => selectedCompanyId ? sortedCompanies.find((company) => company.company_id === selectedCompanyId) : null,
    [selectedCompanyId, sortedCompanies]
  );
  const eventDates = useMemo(
    () => scheduledEvents
      .map((event) => eventDate(event, timeZone))
      .filter((date): date is Date => Boolean(date))
      .map(startOfDay),
    [scheduledEvents, timeZone]
  );
  const minEventDate = useMemo(() => eventDates.reduce<Date | null>((min, date) => (!min || date < min ? date : min), null), [eventDates]);
  const maxEventDate = useMemo(() => eventDates.reduce<Date | null>((max, date) => (!max || date > max ? date : max), null), [eventDates]);
  const rangeStart = useMemo(() => startOfDay(minEventDate && minEventDate < today ? minEventDate : today), [minEventDate, today]);
  const rangeEnd = useMemo(() => startOfDay(addDays(maxEventDate && maxEventDate > today ? maxEventDate : today, 21)), [maxEventDate, today]);
  const dayCount = Math.max(28, dayDiff(rangeStart, rangeEnd) + 1);
  const days = useMemo(() => Array.from({ length: dayCount }, (_, index) => addDays(rangeStart, index)), [dayCount, rangeStart]);
  const timelineWidth = days.length * dayWidth;
  const todayLeft = dayDiff(rangeStart, today) * dayWidth + dayWidth / 2;
  const currentMonthLabel = formatTimelineMonth(days[Math.min(firstVisibleDayIndex, days.length - 1)] ?? today);
  const monthMarkers = useMemo(
    () => days
      .map((day, index) => ({ day, index }))
      .filter(({ day }) => day.getDate() === 1)
      .map(({ day, index }) => ({
        key: `${day.getFullYear()}-${day.getMonth()}`,
        label: formatTimelineMonth(day),
        left: index * dayWidth
      })),
    [dayWidth, days]
  );
  const initialScrollLeft = Math.max(0, todayLeft - dayWidth * 4);
  const companyIndexById = useMemo(
    () => new Map(sortedCompanies.map((company, index) => [company.company_id, index])),
    [sortedCompanies]
  );
  const timelineEventItems = useMemo(
    () => scheduledEvents.flatMap((event) => {
      const companyIndex = companyIndexById.get(event.company_id);
      const date = eventDate(event, timeZone);
      if (companyIndex === undefined || !date) return [];

      const left = dayDiff(rangeStart, startOfDay(date)) * dayWidth + 8;
      if (left < -dayWidth || left > timelineWidth) return [];

      const kind = eventKindLabel(event.event_type);
      return [{
        event,
        kind,
        label: timelineEventLabel(event, kind),
        left,
        top: companyIndex * rowHeight + 9,
        date
      }];
    }),
    [companyIndexById, dayWidth, rangeStart, rowHeight, scheduledEvents, timeZone, timelineWidth]
  );
  const onTimelineScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = event.currentTarget.scrollLeft;
    const scrollTop = event.currentTarget.scrollTop;
    if (timelineHeaderRef.current) {
      timelineHeaderRef.current.scrollLeft = scrollLeft;
    }
    if (companyRowsRef.current) {
      companyRowsRef.current.style.transform = `translateY(${-scrollTop}px)`;
    }
    const nextIndex = Math.min(days.length - 1, Math.max(0, Math.floor(scrollLeft / dayWidth)));
    setFirstVisibleDayIndex((current) => current === nextIndex ? current : nextIndex);
  }, [dayWidth, days.length]);

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="text-lg font-bold text-ink">タイムライン</h2>
          <p className="mt-1 text-xs font-semibold text-muted">選考・インターンのスケジュールを一元管理</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-ink">{formatDateRange(days[0], days[days.length - 1])}</div>
          <div className="mt-1 text-xs font-semibold text-muted">TZ: {timeZone}</div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[74px_minmax(0,1fr)_44px] overflow-hidden">
        <div className="grid min-h-0 bg-white" style={{ gridTemplateColumns: `${leftWidth}px minmax(0,1fr)` }}>
          <div className="border-b border-r border-line bg-white shadow-[8px_0_16px_rgba(15,23,42,0.04)]" />
          <div ref={timelineHeaderRef} className="min-w-0 overflow-hidden border-b border-line">
            <div className="relative h-[74px]" style={{ width: timelineWidth }}>
              <div className="absolute left-0 top-0 h-[26px]" style={{ width: timelineWidth }}>
                {monthMarkers.map((marker) => (
                  <div
                    key={marker.key}
                    className="absolute top-0 px-3 text-left text-base font-bold text-ink"
                    style={{ left: marker.left }}
                  >
                    {marker.label}
                  </div>
                ))}
              </div>
              <div className="sticky left-0 top-0 z-50 h-[26px] w-20 bg-white px-3 text-left text-base font-bold text-ink shadow-[12px_0_16px_rgba(255,255,255,0.95)]">
                {currentMonthLabel}
              </div>
              <div className="absolute bottom-0 left-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, ${dayWidth}px)` }}>
                {days.map((day) => (
                  <div key={day.toISOString()} className="grid h-[48px] place-items-center border-r border-mutedLine text-center text-xs font-bold">
                    <span className={dayColorClass(day, "date")}>{day.getDate()}</span>
                    <span className={dayColorClass(day, "weekday")}>{weekday(day)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid min-h-0" style={{ gridTemplateColumns: `${leftWidth}px minmax(0,1fr)` }}>
          <div className="relative min-h-0 overflow-hidden border-r border-line bg-white shadow-[8px_0_16px_rgba(15,23,42,0.04)]">
            <div ref={companyRowsRef} className="absolute left-0 top-0 w-full will-change-transform" style={{ height: sortedCompanies.length * rowHeight }}>
                {sortedCompanies.map((company, index) => (
                  <div key={company?.company_id ?? `empty-${index}`} className="flex items-center border-b border-line px-4 text-sm font-bold text-ink" style={{ height: rowHeight }}>
                    {company ? (
                      <button type="button" onClick={() => setSelectedCompanyId(company.company_id)} className="min-w-0 truncate text-left hover:text-brand hover:underline">
                        {company.company_name}
                      </button>
                    ) : ""}
                  </div>
                ))}
            </div>
          </div>

          <div
            data-timeline-scroll
            className="min-h-0 min-w-0 overflow-auto"
            onScroll={onTimelineScroll}
          >
            <TimelineInitialScroll targetLeft={initialScrollLeft} />
            <div className="relative" style={{ width: timelineWidth, height: sortedCompanies.length * rowHeight }}>
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${dayWidth - 1}px, rgb(226 232 240) ${dayWidth - 1}px, rgb(226 232 240) ${dayWidth}px), repeating-linear-gradient(to bottom, transparent 0, transparent ${rowHeight - 1}px, rgb(226 232 240) ${rowHeight - 1}px, rgb(226 232 240) ${rowHeight}px)`
                }}
              />
              {todayLeft >= 0 && todayLeft <= timelineWidth ? <div className="absolute bottom-0 top-0 z-10 w-px bg-brand" style={{ left: todayLeft }} /> : null}
              {timelineEventItems.map(({ event, kind, label, left, top, date }) => {
                return (
                  <div key={`${event.event_id}-${event._rowNumber}`} className="absolute z-20" style={{ left, top }}>
                    <TimelineEventOpenButton eventId={event.event_id} className={`block h-7 w-5 rounded-md border shadow-sm ${eventTypeTone(event.event_type)}`} title={`${label} ${eventScheduleLabel(event, timeZone)}`}>
                      <span className="sr-only">{kind}</span>
                    </TimelineEventOpenButton>
                    <span className={`pointer-events-none absolute left-7 top-1 whitespace-nowrap text-xs font-bold ${eventTextTone(event.event_type)}`}>
                      {formatTime(date)} {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid h-11 shrink-0 bg-white" style={{ gridTemplateColumns: `${leftWidth}px minmax(0,1fr)` }}>
          <button type="button" onClick={() => openAdd("company")} className="flex h-11 items-center border-t border-r border-line bg-white px-4 text-sm font-bold text-brand">+ {"\u4f01\u696d\u3092\u8ffd\u52a0"}</button>
          <div className="h-11 border-t border-line bg-white" />
        </div>
      </div>
      {selectedCompany ? (
        <>
          <button type="button" aria-label="Close company preview" className="fixed inset-0 z-[70] cursor-default bg-transparent" onClick={() => setSelectedCompanyId(null)} />
          <div className="fixed left-[220px] top-24 z-[80] w-80 rounded-2xl border border-line bg-white p-4 text-sm shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-ink">{selectedCompany.company_name}</p>
                <p className="mt-1 text-xs font-semibold text-muted">{selectedCompany.industry || "-"} / {selectedCompany.status || "-"}</p>
              </div>
              <button type="button" onClick={() => setSelectedCompanyId(null)} className="rounded-full px-2 py-1 text-lg leading-none text-muted hover:bg-slate-100">×</button>
            </div>
            <div className="mt-3 grid gap-2 text-xs font-semibold text-muted">
              <div className="flex justify-between gap-3"><span>{"\u5fdc\u52df\u5a92\u4f53"}</span><span className="truncate text-ink">{selectedCompany.application_source || "-"}</span></div>
              <div className="grid gap-1"><span>{"\u30e1\u30e2"}</span><p className="line-clamp-3 font-medium text-ink">{selectedCompany.memo || "-"}</p></div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <EditEntityButton type="company" id={selectedCompany.company_id}>{"\u7de8\u96c6"}</EditEntityButton>
              <button type="button" onClick={() => onOpenCompanyDetail(selectedCompany.company_id)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-slate-50">{"\u4f01\u696d\u8a73\u7d30"}</button>
              <form action={deleteCompanyFromHome} className="ml-auto">
                <input type="hidden" name="returnTo" value="/" />
                <input type="hidden" name="company_id" value={selectedCompany.company_id} />
                <button type="submit" className="rounded-lg px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50">{"\u524a\u9664"}</button>
              </form>
            </div>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function CompanyDetailOverlay({
  company,
  events,
  timeZone,
  onClose
}: {
  company: SheetRow<Company> | null;
  events: SheetRow<JobEvent>[];
  timeZone: string;
  onClose: () => void;
}) {
  if (!company) return null;

  const nextEvent = events.find((event) => {
    const date = eventDate(event, timeZone);
    return !isInactiveStatus(event.status) && (!date || date.getTime() >= Date.now());
  });

  return (
    <>
      <button type="button" aria-label="Close company detail" className="fixed inset-0 z-[90] cursor-default bg-black/5" onClick={onClose} />
      <section className="fixed left-1/2 top-20 z-[100] grid max-h-[calc(100vh-8rem)] w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-white text-sm shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-xl font-bold text-ink">{company.company_name}</p>
            <p className="mt-1 text-xs font-semibold text-muted">{company.industry || "-"} / {company.application_source || "-"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <EditEntityButton type="company" id={company.company_id}>{"\u7de8\u96c6"}</EditEntityButton>
            <form action={deleteCompanyFromHome}>
              <input type="hidden" name="returnTo" value="/" />
              <input type="hidden" name="company_id" value={company.company_id} />
              <button type="submit" className="text-sm font-bold text-red-600 hover:underline">{"\u524a\u9664"}</button>
            </form>
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-base font-bold text-muted hover:bg-slate-100">×</button>
          </div>
        </div>
        <div className="grid gap-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-bold text-blue-700">{"\u6b21\u30a2\u30af\u30b7\u30e7\u30f3"}</p>
            <p className="mt-1 font-bold text-blue-900">{nextEvent ? `${eventScheduleLabel(nextEvent, timeZone)} ${timelineEventLabel(nextEvent, eventKindLabel(nextEvent.event_type))}` : "\u6b21\u306e\u4e88\u5b9a\u306f\u672a\u8a2d\u5b9a"}</p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <SummaryRow label={"\u30b9\u30c6\u30fc\u30bf\u30b9"} value={company.status || "-"} />
            <SummaryRow label={"\u5fdc\u52df\u5a92\u4f53"} value={company.application_source || "-"} />
            <SummaryRow label={"\u696d\u754c"} value={company.industry || "-"} />
            <SummaryRow label={"URL"} value={company.mypage_url || "-"} />
          </div>
          <div>
            <p className="mb-2 text-xs font-bold text-muted">{"\u9078\u8003\u30a4\u30d9\u30f3\u30c8"}</p>
            <div className="divide-y divide-mutedLine rounded-xl border border-line">
              {events.length ? events.map((event) => (
                <div key={event.event_id} className="grid grid-cols-[7rem_minmax(0,1fr)_6rem] items-center gap-3 px-3 py-2">
                  <span className="text-xs font-bold text-muted">{eventDate(event, timeZone) ? eventScheduleLabel(event, timeZone) : "-"}</span>
                  <span className="min-w-0 truncate font-bold text-ink">{timelineEventLabel(event, eventKindLabel(event.event_type))}</span>
                  <StatusBadge value={event.status} />
                </div>
              )) : <p className="px-3 py-3 text-sm font-semibold text-muted">{"\u30a4\u30d9\u30f3\u30c8\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093"}</p>}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold text-muted">{"\u30e1\u30e2"}</p>
            <p className="whitespace-pre-wrap rounded-xl border border-line bg-slate-50 px-4 py-3 font-semibold text-ink">{company.memo || "-"}</p>
          </div>
        </div>
      </section>
    </>
  );
}

function CompanyKarteView({
  company,
  events,
  timeZone,
  onBack
}: {
  company: SheetRow<Company>;
  events: SheetRow<JobEvent>[];
  timeZone: string;
  onBack: () => void;
}) {
  const nextEvent = events.find((event) => {
    const date = eventDate(event, timeZone);
    return !isInactiveStatus(event.status) && (!date || date.getTime() >= Date.now());
  });
  const completedCount = events.filter((event) => isDoneEventStatus(event.status)).length;
  const progressPercent = events.length ? Math.min(100, Math.round((completedCount / events.length) * 100)) : 0;
  const latestMemoEvent = [...events].reverse().find((event) => event.memo);
  const upcomingEvents = events
    .filter((event) => {
      const date = eventDate(event, timeZone);
      return !isInactiveStatus(event.status) && (!date || date.getTime() >= Date.now());
    })
    .slice(0, 2);

  return (
    <section className="grid h-[calc(100vh-10.5rem)] min-h-[620px] gap-3 overflow-hidden">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-sm font-bold text-brand hover:underline">{"\u2190 \u4f01\u696d\u4e00\u89a7\u306b\u623b\u308b"}</button>
        <div className="flex items-center gap-2">
          <EditEntityButton type="company" id={company.company_id} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold text-ink hover:bg-slate-50">{"\u7de8\u96c6"}</EditEntityButton>
          <form action={deleteCompanyFromHome}>
            <input type="hidden" name="returnTo" value="/" />
            <input type="hidden" name="company_id" value={company.company_id} />
            <button type="submit" className="rounded-lg border border-red-100 bg-white px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50">{"\u524a\u9664"}</button>
          </form>
        </div>
      </div>

      <div className="grid min-h-0 grid-rows-[150px_104px_minmax(0,1fr)] gap-3 overflow-hidden">
        <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.9fr)]">
          <Card className="grid min-h-0 grid-cols-[92px_minmax(0,1fr)_170px] items-center gap-4 p-4">
            <div className="grid h-[92px] w-[92px] place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 text-4xl font-black text-white">
              {companyInitial(company.company_name)}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-black text-ink">{company.company_name}</h2>
              <p className="mt-2 truncate text-sm font-semibold text-muted">{[company.industry, company.application_source].filter(Boolean).join(" / ") || "-"}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge value={company.status} />
                <Badge className="border border-blue-100 bg-blue-50 text-blue-700">{events.length}{"\u4ef6"}</Badge>
                {company.updated_at ? <Badge className="border border-slate-200 bg-slate-50 text-slate-600">{"\u66f4\u65b0"} {shortDate(company.updated_at)}</Badge> : null}
              </div>
            </div>
            <div className="grid gap-2">
              <ExternalLinkButton href={company.mypage_url} label={"\u30de\u30a4\u30da\u30fc\u30b8"} />
              <button type="button" onClick={() => openAdd("event")} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold text-ink hover:bg-slate-50">{"\u4e88\u5b9a\u3092\u8ffd\u52a0"}</button>
            </div>
          </Card>

          <Card className="min-h-0 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-ink">{"\u9078\u8003\u9032\u6357"}</h3>
              <span className="text-xs font-bold text-muted">{completedCount}/{events.length}</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {progressEvents(events).map((event, index) => (
                <div key={`${event?.event_id ?? "empty"}-${index}`} className="grid gap-1 text-center">
                  <span className={`mx-auto h-3 w-3 rounded-full ${event ? progressDotClass(event.status) : "bg-slate-200"}`} />
                  <span className="truncate text-[11px] font-bold text-muted">{event ? timelineEventLabel(event, eventKindLabel(event.event_type)) : "-"}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
              {nextEvent ? `${"\u73fe\u5728"}: ${timelineEventLabel(nextEvent, eventKindLabel(nextEvent.event_type))}` : "\u6b21\u306e\u4e88\u5b9a\u306f\u672a\u8a2d\u5b9a"}
            </p>
          </Card>
        </div>

        <div className="grid min-h-0 gap-3 xl:grid-cols-[1fr_1fr_1.3fr]">
          <ActionPanel event={upcomingEvents[0]} timeZone={timeZone} title={"\u6b21\u306b\u3084\u308b\u3053\u3068"} />
          <ActionPanel event={upcomingEvents[1]} timeZone={timeZone} title={"\u305d\u306e\u6b21"} />
          <Card className="min-h-0 p-4">
            <p className="text-xs font-black text-muted">{"\u76f4\u8fd1\u30e1\u30e2"}</p>
            <p className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-ink">{latestMemoEvent?.memo || company.memo || "\u30e1\u30e2\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093"}</p>
          </Card>
        </div>

        <div className="grid min-h-0 gap-3 xl:grid-cols-[0.95fr_0.95fr_1.5fr]">
          <Card className="min-h-0 overflow-hidden p-4">
            <h3 className="mb-3 text-sm font-black text-ink">{"\u57fa\u672c\u60c5\u5831"}</h3>
            <div className="grid gap-2 text-sm">
              <KarteInfo label={"\u4f01\u696d\u540d"} value={company.company_name} />
              <KarteInfo label={"\u696d\u754c"} value={company.industry || "-"} />
              <KarteInfo label={"\u72b6\u614b"} value={company.status || "-"} />
              <KarteInfo label={"\u5fdc\u52df\u5a92\u4f53"} value={company.application_source || company.recruitment_source || "-"} />
              <KarteInfo label={"\u767b\u9332\u65e5"} value={shortDate(company.created_at) || "-"} />
            </div>
            <h3 className="mb-2 mt-4 text-sm font-black text-ink">{"\u30ea\u30f3\u30af"}</h3>
            <ExternalLinkButton href={company.mypage_url} label={company.mypage_url ? "\u30de\u30a4\u30da\u30fc\u30b8\u3092\u958b\u304f" : "\u30ea\u30f3\u30af\u672a\u8a2d\u5b9a"} />
          </Card>

          <Card className="min-h-0 overflow-hidden bg-amber-50 p-4">
            <h3 className="mb-3 text-sm font-black text-ink">{"\u30af\u30a4\u30c3\u30af\u30e1\u30e2"}</h3>
            <p className="h-full overflow-y-auto whitespace-pre-wrap text-sm font-semibold leading-6 text-ink">{company.memo || "\u4f01\u696d\u30e1\u30e2\u306f\u672a\u8a2d\u5b9a\u3067\u3059"}</p>
          </Card>

          <Card className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-black text-ink">{"\u9078\u8003\u30ed\u30b0"}</h3>
              <span className="text-xs font-bold text-muted">{events.length}{"\u4ef6"}</span>
            </div>
            <div className="min-h-0 overflow-y-auto pr-1">
              {events.length ? events.map((event) => (
                <KarteEventLog key={event.event_id} event={event} timeZone={timeZone} />
              )) : (
                <p className="rounded-xl border border-line bg-slate-50 px-4 py-4 text-sm font-semibold text-muted">{"\u30a4\u30d9\u30f3\u30c8\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093"}</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

function ActionPanel({ event, timeZone, title }: { event?: SheetRow<JobEvent>; timeZone: string; title: string }) {
  if (!event) {
    return (
      <Card className="min-h-0 p-4">
        <p className="text-xs font-black text-muted">{title}</p>
        <p className="mt-2 text-sm font-bold text-ink">{"\u672a\u8a2d\u5b9a"}</p>
        <p className="mt-1 text-xs font-semibold text-muted">{"\u4e88\u5b9a\u8ffd\u52a0\u304b\u3089\u6b21\u306e\u30a2\u30af\u30b7\u30e7\u30f3\u3092\u767b\u9332\u3067\u304d\u307e\u3059"}</p>
      </Card>
    );
  }

  return (
    <Card className="min-h-0 p-4">
      <p className="text-xs font-black text-muted">{title}</p>
      <div className="mt-2 flex min-w-0 items-center gap-3">
        <span className={`h-9 w-2 shrink-0 rounded-full ${eventStripClass(event.event_type)}`} />
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-ink">{timelineEventLabel(event, eventKindLabel(event.event_type))}</p>
          <p className="mt-1 truncate text-xs font-bold text-muted">{eventScheduleLabel(event, timeZone)}</p>
        </div>
      </div>
    </Card>
  );
}

function KarteInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center border-b border-mutedLine pb-2 last:border-b-0">
      <span className="text-xs font-bold text-muted">{label}</span>
      <span className="truncate text-sm font-bold text-ink">{value}</span>
    </div>
  );
}

function KarteEventLog({ event, timeZone }: { event: SheetRow<JobEvent>; timeZone: string }) {
  const label = timelineEventLabel(event, eventKindLabel(event.event_type));

  return (
    <div className="relative border-l border-line pb-4 pl-5 last:pb-0">
      <span className={`absolute -left-[7px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${progressDotClass(event.status)}`} />
      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-ink">{label}</p>
          <p className="mt-1 truncate text-xs font-bold text-muted">{eventScheduleLabel(event, timeZone)}</p>
          {event.memo ? <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-muted">{event.memo}</p> : null}
        </div>
        <StatusBadge value={event.status} />
      </div>
    </div>
  );
}

function ExternalLinkButton({ href, label }: { href: string; label: string }) {
  if (!href) {
    return <span className="rounded-lg border border-line bg-slate-50 px-3 py-2 text-center text-sm font-bold text-muted">{label}</span>;
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-white px-3 py-2 text-center text-sm font-bold text-ink hover:bg-slate-50">
      {label}
    </a>
  );
}

function progressEvents(events: SheetRow<JobEvent>[]) {
  return [...events.slice(0, 5), ...Array<undefined>(Math.max(0, 5 - events.length))].slice(0, 5);
}

function isDoneEventStatus(status: string) {
  return status.includes("完了") || status.includes("通過") || status.includes("内定") || status.includes("螳御ｺ") || status.includes("騾夐℃") || status.includes("蜀・ｮ");
}

function progressDotClass(status: string) {
  if (isInactiveStatus(status)) return "bg-slate-300";
  if (isDoneEventStatus(status)) return "bg-brand";
  return "bg-slate-400";
}

function eventStripClass(eventType: string) {
  const tone = eventTypeTone(eventType);
  if (tone.includes("green")) return "bg-emerald-400";
  if (tone.includes("amber")) return "bg-amber-400";
  if (tone.includes("purple")) return "bg-purple-400";
  return "bg-brand";
}

function companyInitial(name: string) {
  return (name.trim()[0] || "J").toUpperCase();
}

function shortDate(value: string) {
  if (!value) return "";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function CompaniesView({ companies, events, eventBuckets, timeZone }: { companies: SheetRow<Company>[]; events: SheetRow<JobEvent>[]; eventBuckets: ReturnType<typeof groupEventsByPeriod>; timeZone: string }) {
  const [karteCompanyId, setKarteCompanyId] = useState<string | null>(null);
  const karteCompany = karteCompanyId ? companies.find((company) => company.company_id === karteCompanyId) : null;
  const companyEventsById = useMemo(() => {
    const byId = new Map<string, SheetRow<JobEvent>[]>();
    for (const event of events) {
      const list = byId.get(event.company_id) ?? [];
      list.push(event);
      byId.set(event.company_id, list);
    }
    return byId;
  }, [events]);
  const karteEvents = useMemo(
    () => karteCompanyId ? sortEventsBySchedule(companyEventsById.get(karteCompanyId) ?? [], timeZone) : [],
    [companyEventsById, karteCompanyId, timeZone]
  );

  useEffect(() => {
    function onOpenCompanyKarte(event: Event) {
      const companyId = (event as CustomEvent<{ companyId?: string }>).detail?.companyId;
      if (companyId) {
        setKarteCompanyId(companyId);
      }
    }

    window.addEventListener("job-hunt-note:company-karte-open", onOpenCompanyKarte);
    return () => window.removeEventListener("job-hunt-note:company-karte-open", onOpenCompanyKarte);
  }, []);

  if (karteCompany) {
    return (
      <CompanyKarteView
        company={karteCompany}
        events={karteEvents}
        timeZone={timeZone}
        onBack={() => setKarteCompanyId(null)}
      />
    );
  }

  return (
    <>
    <div className="grid gap-6">
      <Card>
        <SectionHeader title="企業" description="企業ごとの次アクションを確認します。" />
        <div className="overflow-x-auto border-t border-line">
          <div className="min-w-[920px]">
            <GridHeader columns="grid-cols-[1.4fr_1.8fr_0.9fr_0.9fr_1fr_1.2fr_10rem]">
              <Cell>企業名</Cell><Cell>次アクション</Cell><Cell>業界</Cell><Cell>状態</Cell><Cell>応募媒体</Cell><Cell>メモ</Cell><Cell>操作</Cell>
            </GridHeader>
            {companies.map((company) => (
              <div key={company.company_id} className="grid grid-cols-[1.4fr_1.8fr_0.9fr_0.9fr_1fr_1.2fr_10rem] border-b border-line last:border-b-0 hover:bg-slate-50">
                <Cell strong>
                  <button type="button" onClick={() => setKarteCompanyId(company.company_id)} className="min-w-0 truncate text-left text-brand underline-offset-2 hover:underline">
                    {company.company_name}
                  </button>
                </Cell>
                <Cell>{nextActionLabel(company, companyEventsById.get(company.company_id) ?? [])}</Cell>
                <Cell>{company.industry || "-"}</Cell>
                <Cell><StatusBadge value={company.status} /></Cell>
                <Cell>{company.application_source || "-"}</Cell>
                <Cell>{company.memo || "-"}</Cell>
                <Cell><CompanyActions companyId={company.company_id} /></Cell>
              </div>
            ))}
          </div>
        </div>
      </Card>
      <Card>
        <SectionHeader title="予定" description="期限切れ・今日・明日・今週の順に確認します。" />
        <div className="border-t border-line">
          {eventBuckets.map((bucket) => (
            <section key={bucket.key} className="border-b border-line last:border-b-0">
              <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
                <div><h3 className="text-sm font-bold text-ink">{bucket.label}</h3><p className="text-xs text-muted">{bucket.description}</p></div>
                <span className="text-xs font-semibold text-muted">{bucket.events.length}件</span>
              </div>
              {bucket.events.length ? <div className="divide-y divide-mutedLine">{bucket.events.map((event, index) => <EventRow key={`${event.event_id}-${bucket.key}-${index}`} event={event} companies={companies} showActions />)}</div> : <p className="px-4 py-3 text-sm text-muted">該当なし</p>}
            </section>
          ))}
        </div>
      </Card>
    </div>
    </>
  );
}

function StatsView({ companies, events }: { companies: SheetRow<Company>[]; events: SheetRow<JobEvent>[] }) {
  const total = companies.length;
  const passed = companies.filter((company) => company.status === "通過" || company.status === "内定").length;
  const offers = companies.filter((company) => company.status === "内定").length;
  const interviews = events.filter((event) => eventKindLabel(event.event_type) === "面接");
  const passedInterviews = interviews.filter((event) => event.status === "通過" || event.status === "内定").length;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="総応募数" value={`${total}社`} />
        <Metric label="通過率" value={percent(passed, total)} />
        <Metric label="面接突破率" value={percent(passedInterviews, interviews.length)} />
        <Metric label="内定率" value={percent(offers, total)} />
      </div>
      <Card>
        <SectionHeader title="活動ログ" description="選考イベントを時系列で振り返ります。" />
        <div className="border-t border-line">{sortEventsBySchedule(events).slice(0, 30).map((event, index) => <EventRow key={`${event.event_id}-stats-${index}`} event={event} companies={companies} />)}</div>
      </Card>
    </div>
  );
}

function SettingsView({ settings, companies, events, eventTimeZone, uiTimeZone }: { settings: SheetRow<Setting>[]; companies: SheetRow<Company>[]; events: SheetRow<JobEvent>[]; eventTimeZone: string; uiTimeZone: string }) {
  const applicationSources = settings.filter((setting) => setting.group === "application_source");
  const eventTypes = settings.filter((setting) => setting.group === "main_category");
  const sourceUsage = usageMap(companies.map((company) => company.application_source));
  const typeUsage = usageMap(events.map((event) => event.event_type));

  return (
    <div className="grid gap-6">
      <GoogleCalendarConnectionCard />
      <Card>
        <SectionHeader title="表示・同期設定" description="日時表示やGoogle Calendar同期で使う基本設定です。" />
        <div className="grid gap-2 border-t border-line p-4 text-sm">
          <SummaryRow label="予定設定のデフォルトタイムゾーン" value={eventTimeZone} />
          <SummaryRow label="UI表示のデフォルトタイムゾーン" value={uiTimeZone} />
        </div>
      </Card>
      <SettingList title="応募媒体" group="application_source" settings={applicationSources} usage={sourceUsage} />
      <SettingList title="イベント種別" group="main_category" settings={eventTypes} usage={typeUsage} />
    </div>
  );
}

function SettingList({ title, group, settings, usage }: { title: string; group: string; settings: SheetRow<Setting>[]; usage: Map<string, number> }) {
  return (
    <Card>
      <SectionHeader title={title} compact />
      <div className="divide-y divide-mutedLine border-t border-line">
        {settings.map((setting) => (
          <form key={setting.setting_id} action={updateSettingFromHome} className="grid grid-cols-[minmax(0,1fr)_4rem_8rem] items-center gap-2 px-4 py-2 text-sm">
            <input type="hidden" name="returnTo" value="/" />
            <input type="hidden" name="setting_id" value={setting.setting_id} />
            <input type="hidden" name="group" value={setting.group} />
            <input type="hidden" name="parent" value={setting.parent} />
            <input type="hidden" name="sort_order" value={setting.sort_order} />
            <input name="value" defaultValue={setting.value} className="h-8 rounded-lg border border-line bg-white px-2 text-sm font-semibold text-ink" />
            <span className="text-xs text-muted">{usage.get(setting.value) ?? 0}回</span>
            <span className="flex items-center justify-end gap-2">
              <button type="submit" className="text-xs font-bold text-brand">保存</button>
              <button form={`delete-setting-${setting.setting_id}`} type="submit" className="text-xs font-bold text-red-600">削除</button>
            </span>
          </form>
        ))}
        <form action={createSettingFromHome} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-2 px-4 py-2 text-sm">
          <input type="hidden" name="returnTo" value="/" />
          <input type="hidden" name="group" value={group} />
          <input type="hidden" name="parent" value="" />
          <input type="hidden" name="sort_order" value={String(settings.length * 10 + 10)} />
          <input name="value" placeholder="追加" className="h-8 rounded-lg border border-line bg-white px-2 text-sm font-semibold text-ink" />
          <button type="submit" className="h-8 rounded-lg bg-brand px-3 text-xs font-bold text-white">追加</button>
        </form>
      </div>
      {settings.map((setting) => (
        <form key={`delete-${setting.setting_id}`} id={`delete-setting-${setting.setting_id}`} action={deleteSettingFromHome} className="hidden">
          <input type="hidden" name="returnTo" value="/" />
          <input type="hidden" name="setting_id" value={setting.setting_id} />
        </form>
      ))}
    </Card>
  );
}

function UpcomingList({ events, companies, timeZone, compact = false }: { events: SheetRow<JobEvent>[]; companies: SheetRow<Company>[]; timeZone: string; compact?: boolean }) {
  return (
    <Card className={compact ? "min-h-0 overflow-hidden" : ""}>
      <div className={`flex items-center justify-between ${compact ? "px-3 py-2" : "px-4 py-4"}`}>
        <h2 className={`${compact ? "text-base" : "text-lg"} font-semibold text-ink`}>近日の予定</h2>
        <span className="text-xs font-semibold text-muted">{events.length}件</span>
      </div>
      <div className="divide-y divide-mutedLine border-t border-line px-3">
        {events.length ? events.map((event, index) => <EventRow key={`${event.event_id}-upcoming-${index}`} event={event} companies={companies} compact timeZone={timeZone} />) : <p className="py-4 text-sm text-muted">近日の予定はありません。</p>}
      </div>
    </Card>
  );
}

function EventRow({ event, companies, compact = false, showActions = false, timeZone = defaultTimeZone }: { event: SheetRow<JobEvent>; companies: SheetRow<Company>[]; compact?: boolean; showActions?: boolean; timeZone?: string }) {
  const date = eventDate(event, timeZone);
  const kind = eventKindLabel(event.event_type);
  const columns = compact
    ? "grid-cols-[5rem_minmax(0,1fr)_7rem]"
    : showActions
      ? "grid-cols-[7rem_minmax(0,1fr)_8rem_9rem]"
      : "grid-cols-[7rem_minmax(0,1fr)_8rem]";

  return (
    <div className={`grid items-center gap-3 ${columns} ${compact ? "py-1.5 text-xs" : "px-4 py-3 text-sm"}`}>
      <span className="font-semibold text-ink">{date ? `${date.getMonth() + 1}/${date.getDate()} ${formatTime(date)}` : "未定"}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${eventDot(kind)}`} />
        <span className="shrink-0 font-bold">{kind}</span>
        <span className="truncate font-semibold">{companyName(companies, event.company_id)}</span>
      </span>
      <StatusBadge value={event.status} />
      {showActions ? <EventActions eventId={event.event_id} /> : null}
    </div>
  );
}

function CompanyActions({ companyId }: { companyId: string }) {
  return (
    <span className="flex items-center gap-2">
      <EditEntityButton type="company" id={companyId} />
      <form action={deleteCompanyFromHome}>
        <input type="hidden" name="returnTo" value="/" />
        <input type="hidden" name="company_id" value={companyId} />
        <button type="submit" className="text-sm font-semibold text-red-600 hover:underline">削除</button>
      </form>
    </span>
  );
}

function EventActions({ eventId }: { eventId: string }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <EditEntityButton type="event" id={eventId} />
      <form action={deleteEventFromHome}>
        <input type="hidden" name="returnTo" value="/" />
        <input type="hidden" name="event_id" value={eventId} />
        <button type="submit" className="text-sm font-semibold text-red-600 hover:underline">削除</button>
      </form>
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card className="p-3"><p className="text-xs font-semibold text-muted">{label}</p><p className="mt-1 text-xl font-bold text-ink">{value}</p></Card>;
}

function GridHeader({ columns, children }: { columns: string; children: React.ReactNode }) {
  return <div className={`grid ${columns} border-b border-line bg-slate-50 text-xs font-semibold text-muted`}>{children}</div>;
}

function Cell({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return <div className={`min-w-0 border-r border-line px-3 py-2 text-sm last:border-r-0 ${strong ? "font-semibold" : ""}`}><div className="truncate">{children}</div></div>;
}

function StatusBadge({ value }: { value: string }) {
  return <Badge className={statusTone(value)}>{value || "-"}</Badge>;
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-center justify-between ${strong ? "border-t border-line pt-2 font-bold" : "font-semibold"}`}><span className="text-muted">{label}</span><span className="text-ink">{value}</span></div>;
}

function Notice({ tone, title, children }: { tone: "ok" | "warn" | "danger"; title: string; children: React.ReactNode }) {
  const styles = { ok: "border-green-200 bg-green-50 text-green-700", warn: "border-amber-200 bg-amber-50 text-amber-800", danger: "border-red-200 bg-red-50 text-red-700" };
  return <section className={`rounded-xl border p-4 text-sm shadow-sm ${styles[tone]}`}><p className="font-semibold">{title}</p><div className="mt-1">{children}</div></section>;
}

function openAdd(mode: "company" | "event") {
  window.dispatchEvent(new CustomEvent("job-hunt-note:add", { detail: mode }));
}

function bySortOrder(a: SheetRow<Setting>, b: SheetRow<Setting>) {
  return toSettingRecord(a).sort_order - toSettingRecord(b).sort_order;
}

function companyName(companies: SheetRow<Company>[], companyId: string) {
  return companies.find((company) => company.company_id === companyId)?.company_name ?? companyId;
}

function usageMap(values: string[]) {
  const map = new Map<string, number>();
  for (const value of values) {
    const key = value.trim();
    if (key) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function percent(value: number, total: number) {
  return total ? `${Math.round((value / total) * 100)}%` : "0%";
}

function eventDot(kind: string) {
  if (kind === "面接" || kind === "面談") return "bg-blue-300";
  if (kind === "ES") return "bg-green-500";
  if (kind === "Webテスト" || kind === "適性検査") return "bg-emerald-400";
  if (kind === "GD") return "bg-amber-400";
  if (kind === "インターン") return "bg-violet-400";
  return "bg-slate-300";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _buildMonthGroups(days: Date[], dayWidth: number) {
  const groups: { key: string; label: string; left: number; width: number }[] = [];
  for (let index = 0; index < days.length; index += 1) {
    const day = days[index];
    const previous = days[index - 1];
    if (previous && previous.getMonth() === day.getMonth()) continue;

    let end = index + 1;
    while (end < days.length && days[end].getMonth() === day.getMonth()) end += 1;
    groups.push({ key: `${day.getFullYear()}-${day.getMonth()}`, label: `${day.getMonth() + 1}月`, left: index * dayWidth, width: (end - index) * dayWidth });
  }
  return groups;
}

function formatDateRange(start: Date, end: Date) {
  return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 〜 ${end.getFullYear()}年${end.getMonth() + 1}月${end.getDate()}日`;
}

function formatTimelineMonth(date: Date) {
  return `${date.getMonth() + 1}\u6708`;
}

function timelineEventLabel(event: SheetRow<JobEvent>, fallback: string) {
  return event.title || event.event_type || fallback;
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function dayDiff(from: Date, to: Date) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

function weekday(date: Date) {
  return ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _isWeekend(date: Date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function dayColorClass(date: Date, part: "date" | "weekday") {
  if (date.getDay() === 0) return "text-red-500";
  if (date.getDay() === 6) return "text-brand";
  return part === "date" ? "text-ink" : "text-muted";
}
