"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, BriefcaseBusiness, CalendarDays, CheckCircle2, Clock3, FileBarChart2, PieChart, TrendingUp, Trophy, type LucideIcon } from "lucide-react";

import { ClientViewShell, type ClientAppView } from "@/components/client-view-shell";
import { EditEntityButton } from "@/components/edit-entity-button";
import {
  useLocalCompanyDrafts,
  useLocalCompanyDeletes,
  useLocalCompanyUpdates,
  useLocalEventDrafts,
  useLocalEventDeletes,
  useLocalEventUpdates,
  saveLocalCompanyDelete,
  saveLocalEventDelete,
  localDraftsSyncedEvent,
  type LocalCompanyDraft,
  type LocalCompanyDeleteDraft,
  type LocalCompanyUpdateDraft,
  type LocalEventDraft,
  type LocalEventDeleteDraft,
  type LocalEventUpdateDraft
} from "@/components/local-draft-sync-panel";
import { TimelineEventOpenButton } from "@/components/timeline-event-open-button";
import { TimelineInitialScroll } from "@/components/timeline-initial-scroll";
import { Badge } from "@/components/ui/badge";
import { Card, SectionHeader } from "@/components/ui/card";
import { TimeZoneSelect } from "@/components/event-datetime-fields";
import { convertZonedDateTime, defaultTimeZone } from "@/lib/datetime";
import type { SheetRow } from "@/lib/google-sheets";
import {
  createSettingFromHome,
  deleteSettingFromHome,
  updateSettingFromHome
} from "@/lib/home-actions";
import {
  eventDate,
  eventColorGroup,
  eventKindLabel,
  eventScheduleLabel,
  eventScheduleRangeLabel,
  eventTextTone,
  eventTypeTone,
  groupEventsByPeriod,
  isDateOnlyEvent,
  isInactiveStatus,
  nextActionLabel,
  sortCompaniesForTimeline,
  sortEventsBySchedule,
  statusTone
} from "@/lib/planning";
import { toSettingRecord } from "@/lib/records";
import { companyStatuses, type Company } from "@/types/company";
import { eventStatuses, type JobEvent } from "@/types/event";
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
  initialCompanyId?: string;
};

type EditTarget =
  | { type: "event"; id: string }
  | { type: "company"; id: string };

type AddRequest =
  | "company"
  | "event"
  | { mode?: "company" | "event" | null; companyId?: string; date?: string; startDatetime?: string; endDatetime?: string; timeMode?: string };

const addPreviewEventName = "job-hunt-note:event-add-preview";
const addPreviewChangeEventName = "job-hunt-note:event-add-preview-change";
const clearPreviewEventName = "job-hunt-note:event-preview-clear";

type TimelineDraftPreview = {
  date: string;
  companyId?: string;
  startDatetime?: string;
  endDatetime?: string;
};

type LocalDraftsSyncedDetail = {
  companyDrafts: LocalCompanyDraft[];
  eventDrafts: LocalEventDraft[];
  companyUpdates: LocalCompanyUpdateDraft[];
  eventUpdates: LocalEventUpdateDraft[];
  companyDeletes: LocalCompanyDeleteDraft[];
  eventDeletes: LocalEventDeleteDraft[];
  syncedAt: string;
};

function clearEventAddPreview() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(clearPreviewEventName));
}

export function HomeClient({
  initialView,
  companies: initialCompanies,
  events: initialEvents,
  settings: initialSettings,
  error,
  actionError,
  monthParam,
  initialCompanyId
}: HomeClientProps) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [events, setEvents] = useState(initialEvents);
  const [settings, setSettings] = useState(initialSettings);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [detailCompanyId, setDetailCompanyId] = useState<string | null>(null);
  const [karteCompanyRequest, setKarteCompanyRequest] = useState<{ companyId: string; version: number } | null>(
    initialCompanyId ? { companyId: initialCompanyId, version: 0 } : null
  );
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [addRequest, setAddRequest] = useState<{ detail: AddRequest; version: number } | null>(null);
  const hasInitialSnapshot = initialCompanies.length > 0 || initialEvents.length > 0 || initialSettings.length > 0;
  const localEventDrafts = useLocalEventDrafts();
  const localCompanyDrafts = useLocalCompanyDrafts();
  const localEventUpdates = useLocalEventUpdates();
  const localCompanyUpdates = useLocalCompanyUpdates();
  const localEventDeletes = useLocalEventDeletes();
  const localCompanyDeletes = useLocalCompanyDeletes();

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
    const preloadAddDrawer = () => {
      void import("@/components/add-entity-actions");
      void import("@/components/event-datetime-fields");
      void import("@/components/period-event-fields");
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preloadAddDrawer, { timeout: 1500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(preloadAddDrawer, 600);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

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

  useEffect(() => {
    function onOpenCompanyKarte(event: Event) {
      const companyId = (event as CustomEvent<{ companyId?: string }>).detail?.companyId;
      if (companyId) {
        setKarteCompanyRequest((current) => ({ companyId, version: (current?.version ?? 0) + 1 }));
      }
    }

    window.addEventListener("job-hunt-note:company-karte-open", onOpenCompanyKarte);
    return () => window.removeEventListener("job-hunt-note:company-karte-open", onOpenCompanyKarte);
  }, []);

  const openCompanyKarte = useCallback((companyId: string) => {
    setDetailCompanyId(null);
    window.dispatchEvent(new CustomEvent("job-hunt-note:company-karte-open", { detail: { companyId } }));
  }, []);

  useEffect(() => {
    function onEdit(event: Event) {
      const detail = (event as CustomEvent<EditTarget>).detail;
      if (detail?.type === "event" || detail?.type === "company") {
        clearEventAddPreview();
        setAddRequest(null);
        setEditTarget(detail);
      }
    }

    window.addEventListener("job-hunt-note:edit", onEdit);
    return () => window.removeEventListener("job-hunt-note:edit", onEdit);
  }, []);

  useEffect(() => {
    function onAdd(event: Event) {
      const detail = (event as CustomEvent<AddRequest>).detail;
      const mode = typeof detail === "object" && detail !== null ? detail.mode : detail;
      if (mode === "company" || mode === "event") {
        setEditTarget(null);
        setAddRequest((current) => ({ detail, version: (current?.version ?? 0) + 1 }));
      }
    }

    window.addEventListener("job-hunt-note:add", onAdd);
    return () => window.removeEventListener("job-hunt-note:add", onAdd);
  }, []);

  useEffect(() => {
    function onLocalDraftsSynced(event: Event) {
      const detail = (event as CustomEvent<LocalDraftsSyncedDetail>).detail;
      if (!detail) return;
      setCompanies((current) => applySyncedCompanies(current, detail));
      setEvents((current) => applySyncedEvents(current, detail));
    }

    window.addEventListener(localDraftsSyncedEvent, onLocalDraftsSynced);
    return () => window.removeEventListener(localDraftsSyncedEvent, onLocalDraftsSynced);
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
  const legacyEventTypeOptions = eventTypes.length
    ? eventTypes
    : ["ES", "Webテスト", "適性検査", "面接", "GD", "インターン", "説明会", "その他"];
  const eventTypeOptions = eventTypes.length
    ? legacyEventTypeOptions
    : ["ES", "履歴書提出", "課題提出", "テスト", "説明会", "セミナー", "面談", "インターン", "選考会", "面接"];
  const legacyTimeZone = useMemo(() => settings.find((setting) => setting.group === "timezone")?.value, [settings]);
  const eventDefaultTimeZone = useMemo(() => settings.find((setting) => setting.group === "event_default_timezone")?.value || legacyTimeZone || defaultTimeZone, [legacyTimeZone, settings]);
  const uiDefaultTimeZone = useMemo(() => settings.find((setting) => setting.group === "ui_default_timezone")?.value || legacyTimeZone || defaultTimeZone, [legacyTimeZone, settings]);
  const visibleCompanies = useMemo(
    () => mergeLocalCompanies(companies, localCompanyDrafts, localCompanyUpdates, localCompanyDeletes),
    [companies, localCompanyDrafts, localCompanyUpdates, localCompanyDeletes]
  );
  const visibleCompanyIds = useMemo(() => new Set(visibleCompanies.map((company) => company.company_id)), [visibleCompanies]);
  const visibleEvents = useMemo(
    () => mergeLocalEvents(events, localEventDrafts, localEventUpdates, localEventDeletes).filter((event) => visibleCompanyIds.has(event.company_id)),
    [events, localEventDrafts, localEventUpdates, localEventDeletes, visibleCompanyIds]
  );
  const timelineOrderedCompanies = useMemo(
    () => sortCompaniesForTimeline(visibleCompanies, visibleEvents),
    [visibleCompanies, visibleEvents]
  );
  const visibleError = error ?? syncError;
  const detailCompany = detailCompanyId ? visibleCompanies.find((company) => company.company_id === detailCompanyId) : null;
  const detailCompanyEvents = useMemo(
    () => detailCompanyId ? sortEventsBySchedule(visibleEvents.filter((event) => event.company_id === detailCompanyId), uiDefaultTimeZone) : [],
    [detailCompanyId, visibleEvents, uiDefaultTimeZone]
  );
  const editingEvent = editTarget?.type === "event" ? visibleEvents.find((event) => event.event_id === editTarget.id) : undefined;
  const editingCompany = editTarget?.type === "company" ? visibleCompanies.find((company) => company.company_id === editTarget.id) : undefined;
  const addMode = addRequest ? (typeof addRequest.detail === "object" && addRequest.detail !== null ? addRequest.detail.mode : addRequest.detail) : null;
  const eventAddRequest = addMode === "event" ? addRequest : null;
  const addRightPanel = eventAddRequest ? (
    <AddEntityActions
      companies={timelineOrderedCompanies}
      applicationSources={applicationSources}
      eventTypeOptions={eventTypeOptions}
      timeZone={eventDefaultTimeZone}
      inline={false}
      returnTo="/"
      request={eventAddRequest.detail}
      requestVersion={eventAddRequest.version}
      listenToGlobal={false}
      eventPresentation="panel"
      onClose={() => {
        clearEventAddPreview();
        setAddRequest(null);
      }}
    />
  ) : null;
  const editRightPanel = editingEvent ? (
    <EventDraftEditSidebar
      event={editingEvent}
      events={visibleEvents}
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
  const rightPanel = addRightPanel ?? editRightPanel;

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
      rightPanel={rightPanel}
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
          content: <CompaniesView companies={visibleCompanies} events={visibleEvents} timeZone={uiDefaultTimeZone} karteCompanyRequest={karteCompanyRequest} />
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
            companies={timelineOrderedCompanies}
            applicationSources={applicationSources}
            eventTypeOptions={eventTypeOptions}
            timeZone={eventDefaultTimeZone}
            inline={false}
            returnTo="/"
            request={addMode === "company" ? addRequest?.detail : null}
            requestVersion={addRequest?.version}
            listenToGlobal={false}
            onClose={() => {
              clearEventAddPreview();
              setAddRequest(null);
            }}
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
  updates: LocalCompanyUpdateDraft[],
  deletes: LocalCompanyDeleteDraft[]
) {
  const deletedIds = new Set(deletes.map((deleteDraft) => deleteDraft.company_id));
  const pendingUpdates = updates.filter((update) => !update.synced_at);
  const updateById = new Map(pendingUpdates.map((update) => [update.company_id, update]));
  const existingIds = new Set(companies.filter((company) => !deletedIds.has(company.company_id)).map((company) => company.company_id));
  const merged = companies.filter((company) => !deletedIds.has(company.company_id)).map((company) => {
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
    .filter((draft) => !draft.synced_at && !existingIds.has(draft.company_id) && !deletedIds.has(draft.company_id))
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
  updates: LocalEventUpdateDraft[],
  deletes: LocalEventDeleteDraft[]
) {
  const deletedIds = new Set(deletes.map((deleteDraft) => deleteDraft.event_id));
  const pendingUpdates = updates.filter((update) => !update.synced_at);
  const updateById = new Map(pendingUpdates.map((update) => [update.event_id, update]));
  const existingIds = new Set(events.filter((event) => !deletedIds.has(event.event_id)).map((event) => event.event_id));
  const merged = events.filter((event) => !deletedIds.has(event.event_id)).map((event) => {
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
      event_series_id: update.event_series_id,
      series_day_index: update.series_day_index,
      time_mode: update.time_mode,
      status: update.status,
      person: update.person,
      meeting_url: update.meeting_url,
      memo: update.memo,
      sync_to_calendar: update.sync_to_calendar,
      updated_at: update.created_at
    } : event;
  });
  const newDrafts = drafts
    .filter((draft) => !draft.synced_at && !existingIds.has(draft.draft_id) && !deletedIds.has(draft.draft_id))
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
      event_series_id: draft.event_series_id,
      series_day_index: draft.series_day_index,
      time_mode: draft.time_mode,
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

function applySyncedCompanies(companies: SheetRow<Company>[], detail: LocalDraftsSyncedDetail) {
  const deletedIds = new Set(detail.companyDeletes.map((deleteDraft) => deleteDraft.company_id));
  const byId = new Map(companies.filter((company) => !deletedIds.has(company.company_id)).map((company) => [company.company_id, company]));

  for (const draft of detail.companyDrafts) {
    byId.set(draft.company_id, companyDraftToRow(draft, detail.syncedAt));
  }

  for (const update of detail.companyUpdates) {
    const existing = byId.get(update.company_id);
    byId.set(update.company_id, {
      _rowNumber: existing?._rowNumber ?? -1,
      company_id: update.company_id,
      company_name: update.company_name,
      industry: update.industry,
      status: update.status,
      recruitment_source: existing?.recruitment_source ?? "",
      order_index: existing?.order_index ?? "0",
      mypage_url: update.mypage_url,
      memo: update.memo,
      created_at: existing?.created_at ?? update.created_at,
      updated_at: detail.syncedAt,
      application_source: update.application_source
    } satisfies SheetRow<Company>);
  }

  return [...byId.values()];
}

function applySyncedEvents(events: SheetRow<JobEvent>[], detail: LocalDraftsSyncedDetail) {
  const deletedIds = new Set(detail.eventDeletes.map((deleteDraft) => deleteDraft.event_id));
  const byId = new Map(events.filter((event) => !deletedIds.has(event.event_id)).map((event) => [event.event_id, event]));

  for (const draft of detail.eventDrafts) {
    byId.set(draft.draft_id, eventDraftToRow(draft, detail.syncedAt));
  }

  for (const update of detail.eventUpdates) {
    const existing = byId.get(update.event_id);
    byId.set(update.event_id, {
      _rowNumber: existing?._rowNumber ?? -1,
      event_id: update.event_id,
      company_id: update.company_id,
      selection_type: update.selection_type,
      event_type: update.event_type,
      title: update.title,
      start_datetime: update.start_datetime,
      end_datetime: update.end_datetime,
      timezone: update.timezone,
      is_period: update.is_period,
      period_end_date: update.period_end_date,
      event_series_id: update.event_series_id,
      series_day_index: update.series_day_index,
      time_mode: update.time_mode,
      status: update.status,
      person: update.person,
      meeting_url: update.meeting_url,
      memo: update.memo,
      sync_to_calendar: update.sync_to_calendar,
      google_calendar_event_id: existing?.google_calendar_event_id ?? "",
      calendar_last_synced_at: existing?.calendar_last_synced_at ?? "",
      created_at: existing?.created_at ?? update.created_at,
      updated_at: detail.syncedAt
    } satisfies SheetRow<JobEvent>);
  }

  return [...byId.values()];
}

function companyDraftToRow(draft: LocalCompanyDraft, syncedAt: string) {
  return {
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
    updated_at: syncedAt,
    application_source: draft.application_source
  } satisfies SheetRow<Company>;
}

function eventDraftToRow(draft: LocalEventDraft, syncedAt: string) {
  return {
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
    event_series_id: draft.event_series_id,
    series_day_index: draft.series_day_index,
    time_mode: draft.time_mode,
    status: draft.status,
    person: draft.person,
    meeting_url: draft.meeting_url,
    memo: draft.memo,
    sync_to_calendar: draft.sync_to_calendar,
    google_calendar_event_id: "",
    calendar_last_synced_at: "",
    created_at: draft.created_at,
    updated_at: syncedAt
  } satisfies SheetRow<JobEvent>;
}

function DashboardView({ companies, events, timeZone, onOpenCompanyDetail }: { companies: SheetRow<Company>[]; events: SheetRow<JobEvent>[]; timeZone: string; onOpenCompanyDetail: (companyId: string) => void }) {
  const todayStart = startOfDay(new Date()).getTime();
  const upcomingEvents = sortEventsBySchedule(events, timeZone)
    .filter((event) => !isInactiveStatus(event.status))
    .filter((event) => isPlannedStatus(event.status))
    .filter((event) => {
      const date = eventDate(event, timeZone);
      return date ? startOfDay(date).getTime() >= todayStart : false;
    })
    .slice(0, 5);
  const resultWaitingEvents = sortEventsBySchedule(events, timeZone)
    .filter((event) => needsResultStatusUpdate(event, timeZone));

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_205px] gap-3 overflow-hidden">
      <TimelineView companies={companies} events={events} timeZone={timeZone} onOpenCompanyDetail={onOpenCompanyDetail} />
      <div className="grid min-h-0 gap-3 xl:grid-cols-2">
        <UpcomingList events={upcomingEvents} companies={companies} timeZone={timeZone} compact />
        <ResultWaitingList events={resultWaitingEvents} companies={companies} timeZone={timeZone} />
      </div>
    </div>
  );
}

function TimelineView({ companies, events, timeZone, onOpenCompanyDetail }: { companies: SheetRow<Company>[]; events: SheetRow<JobEvent>[]; timeZone: string; onOpenCompanyDetail: (companyId: string) => void }) {
  const [firstVisibleDayIndex, setFirstVisibleDayIndex] = useState(0);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [draftPreview, setDraftPreview] = useState<TimelineDraftPreview | null>(null);
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
  const timelineCompanyEventsById = useMemo(() => {
    const byId = new Map<string, SheetRow<JobEvent>[]>();
    for (const event of scheduledEvents) {
      const list = byId.get(event.company_id) ?? [];
      list.push(event);
      byId.set(event.company_id, list);
    }
    return byId;
  }, [scheduledEvents]);
  const selectedCompany = useMemo(
    () => selectedCompanyId ? sortedCompanies.find((company) => company.company_id === selectedCompanyId) : null,
    [selectedCompanyId, sortedCompanies]
  );

  useEffect(() => {
    function onPreview(event: Event) {
      const detail = (event as CustomEvent<TimelineDraftPreview>).detail;
      if (detail?.date) {
        setDraftPreview(detail);
      }
    }

    function onClear() {
      setDraftPreview(null);
    }

    window.addEventListener(addPreviewEventName, onPreview);
    window.addEventListener(addPreviewChangeEventName, onPreview);
    window.addEventListener(clearPreviewEventName, onClear);
    return () => {
      window.removeEventListener(addPreviewEventName, onPreview);
      window.removeEventListener(addPreviewChangeEventName, onPreview);
      window.removeEventListener(clearPreviewEventName, onClear);
    };
  }, []);
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
  const timelineEventItems = useMemo(() => {
    const grouped = new Map<string, {
      companyIndex: number;
      dateKey: string;
      left: number;
      events: Array<{ event: SheetRow<JobEvent>; date: Date; kind: string; label: string }>;
    }>();

    for (const event of scheduledEvents) {
      const companyIndex = companyIndexById.get(event.company_id);
      const date = eventDate(event, timeZone);
      if (companyIndex === undefined || !date) continue;

      const day = startOfDay(date);
      const left = dayDiff(rangeStart, day) * dayWidth + 7;
      if (left < -dayWidth || left > timelineWidth) continue;

      const dateKey = formatDateKey(day);
      const groupKey = `${event.company_id}-${dateKey}`;
      const kind = eventKindLabel(event.event_type);
      const group = grouped.get(groupKey) ?? { companyIndex, dateKey, left, events: [] };
      group.events.push({ event, date, kind, label: timelineEventLabel(event, kind) });
      grouped.set(groupKey, group);
    }

    const groupsByCompany = new Map<number, Array<{
      companyIndex: number;
      dateKey: string;
      left: number;
      events: Array<{ event: SheetRow<JobEvent>; date: Date; kind: string; label: string }>;
    }>>();

    for (const group of grouped.values()) {
      const list = groupsByCompany.get(group.companyIndex) ?? [];
      list.push(group);
      groupsByCompany.set(group.companyIndex, list);
    }

    const laneTops = [5, 25];
    const centerTop = 14;
    const overlapGap = 8;
    const items: Array<{
      event: SheetRow<JobEvent>;
      kind: string;
      label: string;
      labelMaxWidth?: number;
      companyIndex: number;
      left: number;
      top: number;
      date: Date;
      laneIndex: number;
      stackCount: number;
    }> = [];

    for (const [companyIndex, groups] of groupsByCompany.entries()) {
      const sortedGroups = groups.sort((a, b) => a.left - b.left || a.dateKey.localeCompare(b.dateKey));

      for (const group of sortedGroups) {
        const visibleEvents = sortEventsBySchedule(group.events.map((item) => item.event), timeZone).slice(0, 2)
          .map((event) => group.events.find((item) => item.event.event_id === event.event_id)!)
          .filter(Boolean);
        if (visibleEvents.length > 1) {
          visibleEvents.forEach((item, index) => {
            items.push({
              ...item,
              companyIndex,
              left: group.left,
              top: companyIndex * rowHeight + centerTop,
              laneIndex: index,
              stackCount: visibleEvents.length
            });
          });
          continue;
        }

        const item = visibleEvents[0];
        if (!item) continue;

        items.push({
          ...item,
          companyIndex,
          left: group.left,
          top: companyIndex * rowHeight + centerTop,
          laneIndex: 0,
          stackCount: 1
        });
      }
    }

    const itemsByCompany = new Map<number, typeof items>();
    for (const item of items) {
      const list = itemsByCompany.get(item.companyIndex) ?? [];
      list.push(item);
      itemsByCompany.set(item.companyIndex, list);
    }

    for (const [companyIndex, list] of itemsByCompany.entries()) {
      list.sort((a, b) => a.left - b.left || a.date.getTime() - b.date.getTime());

      const clusters: Array<typeof list> = [];
      let cluster: typeof list = [];
      let clusterEnd = -Infinity;

      for (const item of list) {
        const itemEnd = estimateTimelineItemEnd(item);
        if (cluster.length === 0 || item.left <= clusterEnd + overlapGap) {
          cluster.push(item);
          clusterEnd = Math.max(clusterEnd, itemEnd);
          continue;
        }

        clusters.push(cluster);
        cluster = [item];
        clusterEnd = itemEnd;
      }
      if (cluster.length > 0) clusters.push(cluster);

      for (const currentCluster of clusters) {
        if (currentCluster.length === 1) {
          const item = currentCluster[0];
          item.laneIndex = 0;
          item.top = companyIndex * rowHeight + centerTop;
          continue;
        }

        const laneEnd = [-Infinity, -Infinity];
        for (const item of currentCluster) {
          const topLaneAvailable = item.left > laneEnd[0] + overlapGap;
          const laneIndex = topLaneAvailable ? 0 : 1;
          item.laneIndex = laneIndex;
          item.top = companyIndex * rowHeight + laneTops[laneIndex];
          laneEnd[laneIndex] = Math.max(laneEnd[laneIndex], estimateTimelineItemEnd(item));
        }
      }
    }

    const itemsByLane = new Map<string, typeof items>();
    for (const item of items) {
      const key = `${item.companyIndex}-${item.laneIndex}`;
      const list = itemsByLane.get(key) ?? [];
      list.push(item);
      itemsByLane.set(key, list);
    }

    for (const list of itemsByLane.values()) {
      list.sort((a, b) => a.left - b.left);
      for (let index = 0; index < list.length; index += 1) {
        const item = list[index];
        const next = list[index + 1];
        const available = next ? next.left - item.left - 52 : 128;
        item.labelMaxWidth = Math.max(28, Math.min(128, available));
      }
    }

    return items;
  }, [companyIndexById, dayWidth, rangeStart, rowHeight, scheduledEvents, timeZone, timelineWidth]);
  const draftPreviewItem = useMemo(() => {
    if (!draftPreview?.date || !draftPreview.companyId) return null;
    const companyIndex = companyIndexById.get(draftPreview.companyId);
    if (companyIndex === undefined) return null;
    const day = parseDateKey(draftPreview.date);
    if (!day) return null;
    const left = dayDiff(rangeStart, day) * dayWidth + 7;
    if (left < -dayWidth || left > timelineWidth) return null;

    return {
      left,
      top: companyIndex * rowHeight + 14
    };
  }, [companyIndexById, dayWidth, draftPreview, rangeStart, rowHeight, timelineWidth]);
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
  const onTimelineGridClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dayIndex = Math.floor((event.clientX - rect.left) / dayWidth);
    const companyIndex = Math.floor((event.clientY - rect.top) / rowHeight);
    const day = days[dayIndex];
    const company = sortedCompanies[companyIndex];

    if (!day || !company) return;
    window.dispatchEvent(new CustomEvent(addPreviewEventName, {
      detail: {
        date: formatDateKey(day),
        companyId: company.company_id
      }
    }));
    openAdd("event", company.company_id, formatDateKey(day));
  }, [dayWidth, days, rowHeight, sortedCompanies]);

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
                  <div
                    key={company?.company_id ?? `empty-${index}`}
                    className={`flex items-center border-b border-l-4 border-line px-3 text-sm font-bold text-ink ${company ? companyStatusRibbonClass(effectiveCompanyStatus(company, timelineCompanyEventsById.get(company.company_id) ?? [])) : "border-l-transparent"}`}
                    style={{ height: rowHeight }}
                  >
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
            <div className="relative" style={{ width: timelineWidth, height: sortedCompanies.length * rowHeight }} onClick={onTimelineGridClick}>
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${rowHeight - 1}px, rgb(226 232 240) ${rowHeight - 1}px, rgb(226 232 240) ${rowHeight}px)`
                }}
              />
              {days.slice(1).map((day, index) => (
                <div
                  key={`timeline-line-${day.toISOString()}`}
                  className="pointer-events-none absolute bottom-0 top-0 w-px bg-mutedLine"
                  style={{ left: (index + 1) * dayWidth }}
                />
              ))}
              {todayLeft >= 0 && todayLeft <= timelineWidth ? <div className="absolute bottom-0 top-0 z-10 w-px bg-brand" style={{ left: todayLeft }} /> : null}
              {draftPreviewItem ? (
                <div
                  className="pointer-events-none absolute z-20 grid h-4 w-10 place-items-center rounded-md border border-dashed border-slate-300 bg-white/85 px-1 text-[10px] font-bold leading-none text-muted shadow-sm"
                  style={{ left: draftPreviewItem.left, top: draftPreviewItem.top }}
                >
                  仮
                </div>
              ) : null}
              {timelineEventItems.map(({ event, label, left, top, date, labelMaxWidth }) => {
                const chipLabel = isDateOnlyEvent(event) ? dateOnlyMarker(event.status) : formatTime(date);
                return (
                  <div key={`${event.event_id}-${event._rowNumber}`} className="absolute z-20 h-4" style={{ left, top }}>
                    <TimelineEventOpenButton eventId={event.event_id} className={`grid h-4 w-10 place-items-center overflow-hidden rounded-md border px-1 text-[10px] font-bold leading-none shadow-sm ${eventTypeTone(event.event_type)} ${eventTextTone(event.event_type)}`} title={`${label} ${eventScheduleLabel(event, timeZone)}`}>
                      <span className="block max-w-full truncate">{chipLabel}</span>
                    </TimelineEventOpenButton>
                    <span className={`pointer-events-none absolute left-[45px] top-0 truncate whitespace-nowrap text-[11px] font-bold leading-4 ${eventTextTone(event.event_type)}`} style={{ maxWidth: labelMaxWidth }}>
                      {label}
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
                <p className="mt-1 text-xs font-semibold text-muted">{selectedCompany.industry || "-"} / {effectiveCompanyStatus(selectedCompany, timelineCompanyEventsById.get(selectedCompany.company_id) ?? []) || "-"}</p>
              </div>
              <button type="button" onClick={() => setSelectedCompanyId(null)} className="rounded-full px-2 py-1 text-lg leading-none text-muted hover:bg-slate-100">×</button>
            </div>
            <div className="mt-3 grid gap-2 text-xs font-semibold text-muted">
              <div className="flex justify-between gap-3"><span>{"\u5fdc\u52df\u5a92\u4f53"}</span><span className="truncate text-ink">{selectedCompany.application_source || "-"}</span></div>
              <div className="grid gap-1"><span>{"\u30e1\u30e2"}</span><p className="line-clamp-3 font-medium text-ink">{selectedCompany.memo || "-"}</p></div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <EditEntityButton type="company" id={selectedCompany.company_id}>{"\u7de8\u96c6"}</EditEntityButton>
              <button type="button" onClick={() => openAdd("event", selectedCompany.company_id)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-slate-50">{"\u4e88\u5b9a\u8ffd\u52a0"}</button>
              <button type="button" onClick={() => onOpenCompanyDetail(selectedCompany.company_id)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-slate-50">{"\u4f01\u696d\u8a73\u7d30"}</button>
              <button
                type="button"
                onClick={() => saveCompanyDelete(selectedCompany)}
                className="ml-auto rounded-lg px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
              >
                {"\u524a\u9664"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function estimateTimelineItemEnd(item: { left: number; label: string }) {
  return item.left + 45 + Math.min(150, item.label.length * 8);
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

  const displayStatus = effectiveCompanyStatus(company, events);
  const nextEvent = events.find((event) => {
    const date = eventDate(event, timeZone);
    return !isInactiveStatus(event.status) && (!date || date.getTime() >= Date.now());
  });

  return (
    <>
      <button type="button" aria-label="Close company detail" className="fixed inset-0 z-[90] cursor-default bg-black/5" onClick={onClose} />
      <section className={`fixed left-1/2 top-20 z-[100] grid max-h-[calc(100vh-8rem)] w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line border-l-4 bg-white text-sm shadow-xl ${companyStatusRibbonClass(displayStatus)}`}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-xl font-bold text-ink">{company.company_name}</p>
            <p className="mt-1 text-xs font-semibold text-muted">{company.industry || "-"} / {company.application_source || "-"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <EditEntityButton type="company" id={company.company_id}>{"\u7de8\u96c6"}</EditEntityButton>
            <button type="button" onClick={() => saveCompanyDelete(company)} className="text-sm font-bold text-red-600 hover:underline">{"\u524a\u9664"}</button>
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-base font-bold text-muted hover:bg-slate-100">×</button>
          </div>
        </div>
        <div className="grid gap-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-bold text-blue-700">{"\u6b21\u30a2\u30af\u30b7\u30e7\u30f3"}</p>
            <p className="mt-1 font-bold text-blue-900">{nextEvent ? `${eventScheduleLabel(nextEvent, timeZone)} ${timelineEventLabel(nextEvent, eventKindLabel(nextEvent.event_type))}` : "\u6b21\u306e\u4e88\u5b9a\u306f\u672a\u8a2d\u5b9a"}</p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <SummaryRow label={"\u30b9\u30c6\u30fc\u30bf\u30b9"} value={displayStatus || "-"} />
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
  const displayStatus = effectiveCompanyStatus(company, events);
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
          <button type="button" onClick={() => saveCompanyDelete(company)} className="rounded-lg border border-red-100 bg-white px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50">{"\u524a\u9664"}</button>
        </div>
      </div>

      <div className="grid min-h-0 grid-rows-[150px_104px_minmax(0,1fr)] gap-3 overflow-hidden">
        <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.9fr)]">
          <Card className={`grid min-h-0 grid-cols-[92px_minmax(0,1fr)_170px] items-center gap-4 border-l-4 p-4 ${companyStatusRibbonClass(displayStatus)}`}>
            <div className="grid h-[92px] w-[92px] place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 text-4xl font-black text-white">
              {companyInitial(company.company_name)}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-black text-ink">{company.company_name}</h2>
              <p className="mt-2 truncate text-sm font-semibold text-muted">{[company.industry, company.application_source].filter(Boolean).join(" / ") || "-"}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge value={displayStatus} />
                <Badge className="border border-blue-100 bg-blue-50 text-blue-700">{events.length}{"\u4ef6"}</Badge>
                {company.updated_at ? <Badge className="border border-slate-200 bg-slate-50 text-slate-600">{"\u66f4\u65b0"} {shortDate(company.updated_at)}</Badge> : null}
              </div>
            </div>
            <div className="grid gap-2">
              <ExternalLinkButton href={company.mypage_url} label={"\u30de\u30a4\u30da\u30fc\u30b8"} />
              <button type="button" onClick={() => openAdd("event", company.company_id)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold text-ink hover:bg-slate-50">{"\u4e88\u5b9a\u3092\u8ffd\u52a0"}</button>
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
              <KarteInfo label={"\u72b6\u614b"} value={displayStatus || "-"} />
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
      <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-ink">{label}</p>
          <p className="mt-1 truncate text-xs font-bold text-muted">{eventScheduleLabel(event, timeZone)}</p>
          {event.memo ? <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-muted">{event.memo}</p> : null}
        </div>
        <div className="grid justify-items-end gap-2">
          <StatusBadge value={event.status} />
          <EditEntityButton
            type="event"
            id={event.event_id}
            className="text-xs font-bold text-brand hover:underline"
          >
            {"\u7de8\u96c6"}
          </EditEntityButton>
        </div>
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
  if (matchesStatus(status, "内定", "蜀・ｮ")) return "bg-violet-500";
  if (matchesStatus(status, "通過", "騾夐℃")) return "bg-emerald-500";
  if (matchesStatus(status, "結果待ち", "結果待ち")) return "bg-yellow-400";
  if (matchesStatus(status, "完了", "螳御ｺ")) return "bg-slate-400";
  if (matchesStatus(status, "落選", "關ｽ驕")) return "bg-rose-500";
  if (matchesStatus(status, "辞退", "霎樣")) return "bg-amber-500";
  if (matchesStatus(status, "保留", "菫晉蕗")) return "bg-yellow-400";
  if (matchesStatus(status, "予定", "莠亥ｮ")) return "bg-brand";
  if (isInactiveStatus(status)) return "bg-slate-300";
  if (isDoneEventStatus(status)) return "bg-emerald-500";
  return "bg-slate-400";
}

function matchesStatus(status: string, label: string, fallback: string) {
  return status.includes(label) || status.includes(fallback);
}

function normalizedCompanyStatus(status: string) {
  if (matchesStatus(status, "内定", "内定")) return "内定";
  if (matchesStatus(status, "辞退", "辞退")) return "辞退";
  if (matchesStatus(status, "落選", "落選")) return "落選";
  if (matchesStatus(status, "選考中", "選考中") || matchesStatus(status, "通過", "通過")) return "選考中";
  if (matchesStatus(status, "検討中", "検討中") || matchesStatus(status, "保留", "保留")) return "検討中";
  return status || "検討中";
}

function effectiveCompanyStatus(company: Company, events: SheetRow<JobEvent>[] = []) {
  const status = normalizedCompanyStatus(company.status);
  if (status === "辞退" || status === "落選" || status === "内定") return status;
  const hasSelectionEvent = events.some((event) => {
    const group = eventColorGroup(event.event_type);
    return (group === "test" || group === "selection") && !isInactiveStatus(event.status);
  });
  return hasSelectionEvent ? "選考中" : status;
}

function isPlannedStatus(status: string) {
  return matchesStatus(status, "予定", "莠亥ｮ");
}

function needsResultStatusUpdate(event: SheetRow<JobEvent>, displayTimeZone: string) {
  const end = eventEndForStatusCheck(event, displayTimeZone);
  if (!end || end.getTime() > Date.now()) return false;

  if (isPlannedStatus(event.status)) return true;

  const group = eventColorGroup(event.event_type);
  if (group !== "test" && group !== "selection") return false;

  return !["通過", "落選", "辞退", "内定"].some((status) => matchesStatus(event.status, status, status));
}

function eventEndForStatusCheck(event: SheetRow<JobEvent>, displayTimeZone: string) {
  const start = eventDate(event, displayTimeZone);
  if (!start) return null;
  if (event.end_datetime) {
    return convertZonedDateTime(event.end_datetime, event.timezone || defaultTimeZone, displayTimeZone) ?? new Date(event.end_datetime.replace(" ", "T"));
  }
  if (isDateOnlyEvent(event)) {
    return addDays(startOfDay(start), 1);
  }
  return start;
}

function eventStripClass(eventType: string) {
  const tone = eventTypeTone(eventType);
  if (tone.includes("sky")) return "bg-sky-400";
  if (tone.includes("emerald")) return "bg-emerald-400";
  if (tone.includes("violet")) return "bg-violet-400";
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

function CompaniesView({
  companies,
  events,
  timeZone,
  karteCompanyRequest
}: {
  companies: SheetRow<Company>[];
  events: SheetRow<JobEvent>[];
  timeZone: string;
  karteCompanyRequest: { companyId: string; version: number } | null;
}) {
  const [karteCompanyId, setKarteCompanyId] = useState<string | null>(null);
  const [mode, setMode] = useState<"companies" | "events">("companies");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [recentFilter, setRecentFilter] = useState<RecentFilter>("all");
  const [sortKey, setSortKey] = useState("updated_desc");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
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
  const companyById = useMemo(() => new Map(companies.map((company) => [company.company_id, company])), [companies]);
  const karteEvents = useMemo(
    () => karteCompanyId ? sortEventsBySchedule(companyEventsById.get(karteCompanyId) ?? [], timeZone) : [],
    [companyEventsById, karteCompanyId, timeZone]
  );
  const industryOptions = useMemo(() => uniqueSorted(companies.map((company) => company.industry)), [companies]);
  const sourceOptions = useMemo(() => uniqueSorted(companies.map((company) => companySource(company))), [companies]);
  const companyStatusOptions = useMemo(
    () => uniqueSorted([...companyStatuses, ...companies.map((company) => effectiveCompanyStatus(company, companyEventsById.get(company.company_id) ?? []))]),
    [companies, companyEventsById]
  );
  const eventStatusOptions = useMemo(() => uniqueSorted([...eventStatuses, ...events.map((event) => event.status)]), [events]);
  const eventTypeOptions = useMemo(() => uniqueSorted(events.map((event) => event.event_type || eventKindLabel(event.event_type))), [events]);
  const companyRows = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    return companies
      .map((company) => {
        const companyEvents = sortEventsBySchedule(companyEventsById.get(company.company_id) ?? [], timeZone);
        const nextEvent = companyEvents.find((event) => {
          const date = eventDate(event, timeZone);
          return !isInactiveStatus(event.status) && (!date || startOfDay(date).getTime() >= startOfDay(new Date()).getTime());
        }) ?? null;
        const previousEvent = [...companyEvents].reverse().find((event) => {
          const date = eventDate(event, timeZone);
          return date && startOfDay(date).getTime() < startOfDay(new Date()).getTime();
        }) ?? companyEvents[companyEvents.length - 1] ?? null;
        const displayStatus = effectiveCompanyStatus(company, companyEvents);
        const searchText = normalizeSearch([
          company.company_name,
          company.industry,
          company.status,
          displayStatus,
          company.application_source,
          company.recruitment_source,
          company.memo,
          company.mypage_url,
          ...companyEvents.flatMap((event) => [event.title, event.event_type, event.status, event.person, event.memo, event.meeting_url])
        ].join(" "));
        return { company, companyEvents, nextEvent, previousEvent, searchText, displayStatus };
      })
      .filter((row) => !normalizedQuery || row.searchText.includes(normalizedQuery))
      .filter((row) => statusFilter === "all" || row.displayStatus === statusFilter)
      .filter((row) => industryFilter === "all" || (row.company.industry || "未設定") === industryFilter)
      .filter((row) => sourceFilter === "all" || companySource(row.company) === sourceFilter)
      .filter((row) => matchesRecent(row.company.updated_at, recentFilter))
      .sort((a, b) => applySortDirection(sortCompanySearchRows(a, b, sortKey, timeZone), sortDirection));
  }, [companies, companyEventsById, industryFilter, query, recentFilter, sortDirection, sortKey, sourceFilter, statusFilter, timeZone]);
  const eventRows = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    return events
      .map((event) => {
        const company = companyById.get(event.company_id) ?? null;
        const searchText = normalizeSearch([
          company?.company_name,
          company?.industry,
          company?.application_source,
          event.title,
          event.event_type,
          event.status,
          event.person,
          event.meeting_url,
          event.memo
        ].join(" "));
        return { event, company, searchText };
      })
      .filter((row) => !normalizedQuery || row.searchText.includes(normalizedQuery))
      .filter((row) => statusFilter === "all" || row.event.status === statusFilter)
      .filter((row) => eventTypeFilter === "all" || row.event.event_type === eventTypeFilter)
      .filter((row) => companyFilter === "all" || row.event.company_id === companyFilter)
      .filter((row) => matchesRecent(row.event.updated_at, recentFilter))
      .sort((a, b) => applySortDirection(sortEventSearchRows(a, b, sortKey, timeZone), sortDirection));
  }, [companyById, companyFilter, eventTypeFilter, events, query, recentFilter, sortDirection, sortKey, statusFilter, timeZone]);

  useEffect(() => {
    setStatusFilter("all");
    setIndustryFilter("all");
    setSourceFilter("all");
    setEventTypeFilter("all");
    setCompanyFilter("all");
    setRecentFilter("all");
    setSortKey(mode === "companies" ? "updated_desc" : "date_asc");
    setSortDirection(mode === "companies" ? "desc" : "asc");
  }, [mode]);

  const handleSort = useCallback((nextSortKey: string) => {
    setSortKey((currentSortKey) => {
      if (currentSortKey === nextSortKey) {
        setSortDirection((currentDirection) => currentDirection === "asc" ? "desc" : "asc");
        return currentSortKey;
      }

      setSortDirection(defaultSortDirection(nextSortKey));
      return nextSortKey;
    });
  }, []);

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

  useEffect(() => {
    if (karteCompanyRequest?.companyId) {
      setKarteCompanyId(karteCompanyRequest.companyId);
    }
  }, [karteCompanyRequest]);

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

  const eventBuckets: ReturnType<typeof groupEventsByPeriod> = [];

  if (companies.length >= 0) {
    return (
      <Card className="grid min-h-0 overflow-hidden">
        <div className="border-b border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <SegmentedControl value={mode} onChange={setMode} options={[["companies", "企業"], ["events", "イベント"]]} />
              <p className="mt-2 text-xs font-semibold text-muted">
                {mode === "companies" ? "企業情報と次アクションを横断検索できます。" : "イベント種別・企業・状態で予定を絞り込めます。"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => mode === "companies" ? openAdd("company") : openAdd("event")}
              className="h-10 rounded-lg border border-brand bg-white px-4 text-sm font-bold text-brand shadow-sm hover:bg-blue-50"
            >
              + {mode === "companies" ? "企業を追加" : "予定を追加"}
            </button>
          </div>

          <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(280px,1.6fr)_minmax(150px,0.75fr)_minmax(150px,0.75fr)_minmax(150px,0.75fr)_minmax(150px,0.75fr)]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={mode === "companies" ? "企業名・業界・媒体・メモ・イベントを検索" : "企業名・イベント名・担当者・場所・メモを検索"}
              className={searchInputClass}
            />
            <SearchSelect value={statusFilter} onChange={setStatusFilter} label="状態">
              <option value="all">状態: すべて</option>
              {(mode === "companies" ? companyStatusOptions : eventStatusOptions).map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </SearchSelect>
            {mode === "companies" ? (
              <>
                <SearchSelect value={industryFilter} onChange={setIndustryFilter} label="業界">
                  <option value="all">業界: すべて</option>
                  {industryOptions.map((industry) => <option key={industry} value={industry}>{industry}</option>)}
                </SearchSelect>
                <SearchSelect value={sourceFilter} onChange={setSourceFilter} label="媒体">
                  <option value="all">媒体: すべて</option>
                  {sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}
                </SearchSelect>
              </>
            ) : (
              <>
                <SearchSelect value={eventTypeFilter} onChange={setEventTypeFilter} label="種別">
                  <option value="all">種別: すべて</option>
                  {eventTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                </SearchSelect>
                <SearchSelect value={companyFilter} onChange={setCompanyFilter} label="企業">
                  <option value="all">企業: すべて</option>
                  {companies.map((company) => <option key={company.company_id} value={company.company_id}>{company.company_name}</option>)}
                </SearchSelect>
              </>
            )}
            <SearchSelect value={recentFilter} onChange={(value) => setRecentFilter(value as RecentFilter)} label="最近の活動">
              <option value="all">最近の活動: すべて</option>
              <option value="7d">7日以内</option>
              <option value="30d">1カ月以内</option>
              <option value="90d">3カ月以内</option>
            </SearchSelect>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-muted">
            <span>検索結果: {mode === "companies" ? companyRows.length : eventRows.length}件</span>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setIndustryFilter("all");
                setSourceFilter("all");
                setEventTypeFilter("all");
                setCompanyFilter("all");
                setRecentFilter("all");
              }}
              className="text-brand hover:underline"
            >
              条件をクリア
            </button>
          </div>
        </div>

        <div className="min-h-0 overflow-auto">
          {mode === "companies" ? (
            <CompanySearchTable rows={companyRows} setKarteCompanyId={setKarteCompanyId} timeZone={timeZone} sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
          ) : (
            <EventSearchTable rows={eventRows} setKarteCompanyId={setKarteCompanyId} timeZone={timeZone} sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
          )}
        </div>
      </Card>
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
              <div key={company.company_id} className={`grid grid-cols-[1.4fr_1.8fr_0.9fr_0.9fr_1fr_1.2fr_10rem] border-b border-l-4 border-line last:border-b-0 hover:bg-slate-50 ${companyStatusRibbonClass(company.status)}`}>
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

type RecentFilter = "all" | "7d" | "30d" | "90d";
type SortDirection = "asc" | "desc";

const searchInputClass = "h-10 min-w-0 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100";
const searchSelectClass = "h-10 min-w-0 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100";

function SearchSelect({ value, onChange, label, children }: { value: string; onChange: (value: string) => void; label: string; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className={searchSelectClass}>
      {children}
    </select>
  );
}

function SortHeaderCell({
  sortId,
  sortKey,
  sortDirection,
  onSort,
  children
}: {
  sortId: string;
  sortKey: string;
  sortDirection: SortDirection;
  onSort: (sortKey: string) => void;
  children: React.ReactNode;
}) {
  const active = sortId === sortKey;
  return (
    <div className="min-w-0 border-r border-line px-3 py-2 last:border-r-0">
      <button
        type="button"
        onClick={() => onSort(sortId)}
        className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left transition hover:bg-white ${active ? "text-brand" : "text-muted"}`}
        aria-label={`${String(children)}で並び替え${active ? `（${sortDirection === "asc" ? "昇順" : "降順"}）` : ""}`}
      >
        <span className="truncate">{children}</span>
        <span className={`text-[10px] font-black ${active ? "opacity-100" : "opacity-35"}`}>{active ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </div>
  );
}

function CompanySearchTable({
  rows,
  setKarteCompanyId,
  timeZone,
  sortKey,
  sortDirection,
  onSort
}: {
  rows: Array<{
    company: SheetRow<Company>;
    companyEvents: SheetRow<JobEvent>[];
    nextEvent: SheetRow<JobEvent> | null;
    previousEvent: SheetRow<JobEvent> | null;
    displayStatus: string;
    searchText: string;
  }>;
  setKarteCompanyId: (companyId: string) => void;
  timeZone: string;
  sortKey: string;
  sortDirection: SortDirection;
  onSort: (sortKey: string) => void;
}) {
  if (!rows.length) return <SearchEmpty message="条件に一致する企業がありません。" />;

  return (
    <div className="min-w-[1120px]">
      <GridHeader columns="grid-cols-[minmax(260px,1.35fr)_8rem_minmax(220px,1.2fr)_minmax(180px,0.95fr)_7.5rem_12rem]">
        <SortHeaderCell sortId="name_asc" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort}>企業名</SortHeaderCell>
        <SortHeaderCell sortId="status" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort}>状態</SortHeaderCell>
        <SortHeaderCell sortId="next_asc" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort}>次のアクション</SortHeaderCell>
        <Cell>前回の活動</Cell>
        <SortHeaderCell sortId="updated_desc" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort}>最終更新</SortHeaderCell>
        <Cell>操作</Cell>
      </GridHeader>
      {rows.map(({ company, nextEvent, previousEvent, displayStatus }) => (
        <div
          key={company.company_id}
          role="button"
          tabIndex={0}
          onClick={() => setKarteCompanyId(company.company_id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") setKarteCompanyId(company.company_id);
          }}
          className={`grid cursor-pointer grid-cols-[minmax(260px,1.35fr)_8rem_minmax(220px,1.2fr)_minmax(180px,0.95fr)_7.5rem_12rem] border-b border-l-4 border-line bg-white transition last:border-b-0 hover:bg-slate-50 ${companyStatusRibbonClass(displayStatus)}`}
        >
          <Cell strong>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{company.company_name || "未設定"}</p>
              <p className="mt-1 truncate text-xs font-semibold text-muted">{[company.industry, companySource(company)].filter(Boolean).join(" ・ ") || "基本情報未設定"}</p>
              <p className="mt-1 truncate text-[11px] font-semibold text-muted">{company.mypage_url ? "マイページあり" : "マイページなし"} ・ {company.memo ? "メモあり" : "メモなし"}</p>
            </div>
          </Cell>
          <Cell><StatusBadge value={displayStatus} /></Cell>
          <Cell>{nextEvent ? <SearchEventSummary event={nextEvent} timeZone={timeZone} /> : <span className="text-muted">未設定</span>}</Cell>
          <Cell>{previousEvent ? <SearchEventSummary event={previousEvent} timeZone={timeZone} subtle /> : <span className="text-muted">-</span>}</Cell>
          <Cell>{shortDate(company.updated_at) || "-"}</Cell>
          <Cell>
            <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => setKarteCompanyId(company.company_id)} className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-bold text-brand hover:bg-blue-50">カルテ</button>
              <button type="button" onClick={() => openAdd("event", company.company_id)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-slate-50">予定追加</button>
              <CompanyActions companyId={company.company_id} />
            </div>
          </Cell>
        </div>
      ))}
    </div>
  );
}

function EventSearchTable({
  rows,
  setKarteCompanyId,
  timeZone,
  sortKey,
  sortDirection,
  onSort
}: {
  rows: Array<{ event: SheetRow<JobEvent>; company: SheetRow<Company> | null; searchText: string }>;
  setKarteCompanyId: (companyId: string) => void;
  timeZone: string;
  sortKey: string;
  sortDirection: SortDirection;
  onSort: (sortKey: string) => void;
}) {
  if (!rows.length) return <SearchEmpty message="条件に一致するイベントがありません。" />;

  return (
    <div className="min-w-[1120px]">
      <GridHeader columns="grid-cols-[8.5rem_minmax(220px,1.1fr)_minmax(260px,1.35fr)_8rem_minmax(180px,0.9fr)_7.5rem_10rem]">
        <SortHeaderCell sortId="date_asc" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort}>日時</SortHeaderCell>
        <SortHeaderCell sortId="company_asc" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort}>企業</SortHeaderCell>
        <SortHeaderCell sortId="type_asc" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort}>イベント</SortHeaderCell>
        <Cell>状態</Cell><Cell>場所 / URL</Cell>
        <SortHeaderCell sortId="updated_desc" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort}>最終更新</SortHeaderCell>
        <Cell>操作</Cell>
      </GridHeader>
      {rows.map(({ event, company }, index) => (
        <div key={`${event.event_id}-${index}`} className="grid grid-cols-[8.5rem_minmax(220px,1.1fr)_minmax(260px,1.35fr)_8rem_minmax(180px,0.9fr)_7.5rem_10rem] border-b border-line bg-white transition last:border-b-0 hover:bg-slate-50">
          <Cell>{eventScheduleLabel(event, timeZone)}</Cell>
          <Cell strong>
            <button type="button" onClick={() => company && setKarteCompanyId(company.company_id)} className="min-w-0 truncate text-left text-ink underline-offset-2 hover:text-brand hover:underline">
              {company?.company_name || "未設定"}
            </button>
            <p className="mt-1 truncate text-xs font-semibold text-muted">{[company?.industry, company ? companySource(company) : ""].filter(Boolean).join(" ・ ") || "-"}</p>
          </Cell>
          <Cell>
            <span className="flex min-w-0 items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${eventDot(event.event_type)}`} />
              <span className="truncate font-bold text-ink">{timelineEventLabel(event, eventKindLabel(event.event_type))}</span>
            </span>
            <p className="mt-1 truncate text-xs font-semibold text-muted">{event.event_type || "-"}{event.person ? ` ・ ${event.person}` : ""}</p>
          </Cell>
          <Cell><StatusBadge value={event.status} /></Cell>
          <Cell>{event.meeting_url || event.memo || "-"}</Cell>
          <Cell>{shortDate(event.updated_at) || "-"}</Cell>
          <Cell><EventActions eventId={event.event_id} /></Cell>
        </div>
      ))}
    </div>
  );
}

function SearchEventSummary({ event, timeZone, subtle = false }: { event: SheetRow<JobEvent>; timeZone: string; subtle?: boolean }) {
  return (
    <div className={subtle ? "text-muted" : "text-ink"}>
      <p className="truncate text-sm font-bold">{timelineEventLabel(event, eventKindLabel(event.event_type))}</p>
      <p className="mt-1 truncate text-xs font-semibold">{eventScheduleLabel(event, timeZone)}</p>
    </div>
  );
}

function SearchEmpty({ message }: { message: string }) {
  return <div className="grid h-56 place-items-center text-sm font-semibold text-muted">{message}</div>;
}

function companySource(company: Company) {
  return company.application_source || company.recruitment_source || "未設定";
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function uniqueSorted(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((value) => (value || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ja"));
}

function matchesRecent(value: string, filter: RecentFilter) {
  if (filter === "all") return true;
  const date = value ? new Date(value.replace(" ", "T")) : null;
  if (!date || Number.isNaN(date.getTime())) return false;
  const days = filter === "7d" ? 7 : filter === "30d" ? 30 : 90;
  return Date.now() - date.getTime() <= days * 86_400_000;
}

function dateValue(value: string) {
  const date = value ? new Date(value.replace(" ", "T")) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function eventDateValue(event: SheetRow<JobEvent> | null, timeZone: string) {
  return event ? eventDate(event, timeZone)?.getTime() ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
}

function defaultSortDirection(sortKey: string): SortDirection {
  return sortKey === "updated_desc" ? "desc" : "asc";
}

function applySortDirection(value: number, direction: SortDirection) {
  return direction === "asc" ? value : -value;
}

function sortCompanySearchRows(
  a: { company: SheetRow<Company>; nextEvent: SheetRow<JobEvent> | null; displayStatus: string },
  b: { company: SheetRow<Company>; nextEvent: SheetRow<JobEvent> | null; displayStatus: string },
  sortKey: string,
  timeZone: string
) {
  if (sortKey === "next_asc") return eventDateValue(a.nextEvent, timeZone) - eventDateValue(b.nextEvent, timeZone);
  if (sortKey === "name_asc") return (a.company.company_name || "").localeCompare(b.company.company_name || "", "ja");
  if (sortKey === "status") return (a.displayStatus || "").localeCompare(b.displayStatus || "", "ja") || (a.company.company_name || "").localeCompare(b.company.company_name || "", "ja");
  return dateValue(a.company.updated_at) - dateValue(b.company.updated_at);
}

function sortEventSearchRows(
  a: { event: SheetRow<JobEvent>; company: SheetRow<Company> | null },
  b: { event: SheetRow<JobEvent>; company: SheetRow<Company> | null },
  sortKey: string,
  timeZone: string
) {
  if (sortKey === "updated_desc") return dateValue(a.event.updated_at) - dateValue(b.event.updated_at);
  if (sortKey === "company_asc") return (a.company?.company_name || "").localeCompare(b.company?.company_name || "", "ja");
  if (sortKey === "type_asc") return (a.event.event_type || "").localeCompare(b.event.event_type || "", "ja");
  return eventDateValue(a.event, timeZone) - eventDateValue(b.event, timeZone);
}

function StatsView({ companies, events }: { companies: SheetRow<Company>[]; events: SheetRow<JobEvent>[] }) {
  const [correlationTarget, setCorrelationTarget] = useState<"industry" | "source">("industry");
  const companyById = useMemo(() => new Map(companies.map((company) => [company.company_id, company])), [companies]);
  const eventsByCompanyId = useMemo(() => {
    const byId = new Map<string, SheetRow<JobEvent>[]>();
    for (const event of events) {
      const list = byId.get(event.company_id) ?? [];
      list.push(event);
      byId.set(event.company_id, list);
    }
    return byId;
  }, [events]);
  const datedEvents = useMemo(() => events.filter((event) => eventDate(event)), [events]);
  const totalEventCount = events.length;
  const resultEvents = events.filter((event) => eventColorGroup(event.event_type) === "selection" && (matchesStatus(event.status, "通過", "通過") || matchesStatus(event.status, "落選", "落選")));
  const passedEvents = resultEvents.filter((event) => matchesStatus(event.status, "通過", "通過"));
  const activityMinutes = events.reduce((total, event) => total + completedEventMinutes(event), 0);
  const monthlyStats = useMemo(() => buildMonthlyStats(datedEvents), [datedEvents]);
  const industryBreakdown = useMemo(() => breakdown(companies.map((company) => company.industry || "未設定")), [companies]);
  const sourceBreakdown = useMemo(() => breakdown(companies.map((company) => company.application_source || "未設定")), [companies]);
  const industryPassRates = useMemo(() => buildPassRateBreakdown(events, companyById, "industry"), [companyById, events]);
  const sourcePassRates = useMemo(() => buildPassRateBreakdown(events, companyById, "application_source"), [companyById, events]);
  const companyStatusSummary = useMemo(() => buildCompanyStatusSummary(companies, eventsByCompanyId), [companies, eventsByCompanyId]);
  const eventTypeSummary = useMemo(() => buildEventTypeSummary(events), [events]);
  const weekdayStats = useMemo(() => buildWeekdayStats(datedEvents), [datedEvents]);
  const timeOfDayStats = useMemo(() => buildTimeOfDayStats(events), [events]);
  const busiestMonth = monthlyStats.reduce((best, item) => item.total > best.total ? item : best, { key: "", label: "-", total: 0, participation: 0, minutes: 0 });
  const busiestWeekday = weekdayStats.reduce((best, item) => item.count > best.count ? item : best, { label: "-", count: 0 });
  const correlation = correlationTarget === "industry"
    ? { title: "業界別", countItems: industryBreakdown, passRateItems: industryPassRates }
    : { title: "応募媒体別", countItems: sourceBreakdown, passRateItems: sourcePassRates };

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2.5 overflow-hidden">
      <div className="flex items-end justify-between gap-4"><div><h1 className="text-2xl font-bold leading-tight text-ink">統計</h1><p className="mt-0.5 text-xs leading-tight text-muted">就活の活動状況を可視化し、傾向や相性を分析します。</p></div><span className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold text-muted">全期間集計</span></div>
      <div className="grid gap-2.5 md:grid-cols-4">
        <Metric label="総応募社数" value={`${companies.length}社`} detail={`選考中 ${companies.filter((company) => effectiveCompanyStatus(company, eventsByCompanyId.get(company.company_id) ?? []) === "選考中").length}社`} icon={BriefcaseBusiness} tone="blue" />
        <Metric label="総イベント数" value={`${totalEventCount}件`} detail="提出・参加・選考を含む全イベント" icon={Activity} tone="blue" />
        <Metric label="選考通過率" value={percent(passedEvents.length, resultEvents.length)} detail={resultEvents.length ? `結果確定 ${resultEvents.length}件` : "結果確定イベントなし"} icon={TrendingUp} tone="emerald" />
        <Metric label="総活動時間" value={formatHours(activityMinutes)} detail="予定・終日タスクを除外" icon={Clock3} tone="blue" valueSize="small" />
      </div>

      <div className="grid min-h-0 grid-rows-[292px_142px_230px] gap-2.5 overflow-hidden">
        <div className="grid min-h-0 gap-2.5 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
          <ActivityTrendPanel items={monthlyStats} />
          <CorrelationPanel target={correlationTarget} onTargetChange={setCorrelationTarget} {...correlation} />
        </div>
        <div className="grid min-h-0 gap-2.5 xl:grid-cols-2">
          <SelectionResultSummary items={companyStatusSummary} />
          <EventTypeSummary items={eventTypeSummary} total={totalEventCount} />
        </div>
        <ActivityPatternPanel weekdayItems={weekdayStats} timeItems={timeOfDayStats} peakMonth={busiestMonth} peakWeekday={busiestWeekday} />
      </div>
    </div>
  );
}

function SettingsView({ settings, companies, events, eventTimeZone, uiTimeZone }: { settings: SheetRow<Setting>[]; companies: SheetRow<Company>[]; events: SheetRow<JobEvent>[]; eventTimeZone: string; uiTimeZone: string }) {
  const applicationSources = settings.filter((setting) => setting.group === "application_source");
  const eventTypes = settings.filter((setting) => setting.group === "main_category");
  const eventTimeZoneSetting = settings.find((setting) => setting.group === "event_default_timezone");
  const uiTimeZoneSetting = settings.find((setting) => setting.group === "ui_default_timezone");
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
      <Card>
        <SectionHeader title="タイムゾーン" compact />
        <div className="grid gap-3 border-t border-line p-4 text-sm">
          <TimeZoneSettingForm
            label="予定設定のデフォルトタイムゾーン"
            group="event_default_timezone"
            value={eventTimeZone}
            setting={eventTimeZoneSetting}
            sortOrder="950"
          />
          <TimeZoneSettingForm
            label="UI表示のデフォルトタイムゾーン"
            group="ui_default_timezone"
            value={uiTimeZone}
            setting={uiTimeZoneSetting}
            sortOrder="960"
          />
        </div>
      </Card>
      <SettingList title="応募媒体" group="application_source" settings={applicationSources} usage={sourceUsage} />
      <SettingList title="イベント種別" group="main_category" settings={eventTypes} usage={typeUsage} />
    </div>
  );
}

function TimeZoneSettingForm({
  label,
  group,
  value,
  setting,
  sortOrder
}: {
  label: string;
  group: string;
  value: string;
  setting?: SheetRow<Setting>;
  sortOrder: string;
}) {
  return (
    <form action={setting ? updateSettingFromHome : createSettingFromHome} className="grid items-center gap-2 md:grid-cols-[14rem_minmax(0,1fr)_5rem]">
      <input type="hidden" name="returnTo" value="/" />
      {setting ? <input type="hidden" name="setting_id" value={setting.setting_id} /> : null}
      <input type="hidden" name="group" value={group} />
      <input type="hidden" name="parent" value={setting?.parent ?? ""} />
      <input type="hidden" name="sort_order" value={setting?.sort_order || sortOrder} />
      <span className="text-xs font-bold text-muted">{label}</span>
      <TimeZoneSelect name="value" defaultValue={value} className="h-9 rounded-lg border border-line bg-white px-2 text-sm font-semibold text-ink" />
      <button type="submit" className="h-9 rounded-lg bg-brand px-3 text-xs font-bold text-white">保存</button>
    </form>
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
  const visibleRows = compact ? events.slice(0, 5) : events;
  const emptyRows = compact ? Math.max(0, 5 - visibleRows.length) : 0;

  return (
    <Card className={compact ? "min-h-0 overflow-hidden" : ""}>
      <div className={`flex items-center justify-between ${compact ? "px-3 py-2" : "px-4 py-4"}`}>
        <h2 className={`${compact ? "text-base" : "text-lg"} font-semibold text-ink`}>{"\u8fd1\u65e5\u306e\u4e88\u5b9a"}</h2>
        <span className="text-xs font-semibold text-muted">{events.length}{"\u4ef6"}</span>
      </div>
      <div className={`${compact ? "h-40" : ""} divide-y divide-mutedLine border-t border-line px-3`}>
        {visibleRows.length ? visibleRows.map((event, index) => <EventRow key={`${event.event_id}-upcoming-${index}`} event={event} companies={companies} compact={compact} timeZone={timeZone} />) : <p className="flex h-40 items-center text-sm text-muted">{"\u8fd1\u65e5\u306e\u4e88\u5b9a\u306f\u3042\u308a\u307e\u305b\u3093\u3002"}</p>}
        {Array.from({ length: visibleRows.length ? emptyRows : 0 }, (_, index) => <div key={`upcoming-empty-${index}`} className="h-8" />)}
      </div>
    </Card>
  );
}

function ResultWaitingList({ events, companies, timeZone }: { events: SheetRow<JobEvent>[]; companies: SheetRow<Company>[]; timeZone: string }) {
  return (
    <Card className="min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-base font-semibold text-ink">{"\u7d50\u679c\u5f85\u3061"}</h2>
        <span className="text-xs font-semibold text-muted">{events.length}{"\u4ef6"}</span>
      </div>
      <div className="h-40 divide-y divide-mutedLine overflow-y-auto border-t border-line px-3">
        {events.length ? events.map((event, index) => (
          <ResultWaitingRow key={`${event.event_id}-waiting-${index}`} event={event} companies={companies} timeZone={timeZone} />
        )) : <p className="flex h-40 items-center text-sm text-muted">{"\u7d50\u679c\u66f4\u65b0\u304c\u5fc5\u8981\u306a\u4e88\u5b9a\u306f\u3042\u308a\u307e\u305b\u3093\u3002"}</p>}
      </div>
    </Card>
  );
}

function ResultWaitingRow({ event, companies, timeZone }: { event: SheetRow<JobEvent>; companies: SheetRow<Company>[]; timeZone: string }) {
  const date = eventDate(event, timeZone);
  const dateParts = eventRowDateParts(date, event, timeZone);
  const kind = eventKindLabel(event.event_type);
  const eventLabel = timelineEventLabel(event, event.event_type || kind);

  return (
    <div className="grid h-8 grid-cols-[10.75rem_minmax(0,1fr)_5.5rem_3.75rem] items-center gap-2 text-xs">
      {dateParts ? (
        <span className="grid grid-cols-[2.25rem_2.25rem_6rem] items-center whitespace-nowrap font-semibold tabular-nums text-ink">
          <span>{dateParts.dateText}</span>
          <span>{dateParts.weekdayText}</span>
          <span>{dateParts.timeText}</span>
        </span>
      ) : (
        <span className="font-semibold text-ink">未定</span>
      )}
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${eventDot(event.event_type)}`} />
        <TimelineEventOpenButton
          eventId={event.event_id}
          className="min-w-0 truncate text-left font-bold text-ink hover:text-brand hover:underline"
          title={`${eventLabel} ${eventScheduleRangeLabel(event, timeZone)}`}
        >
          {eventLabel}
        </TimelineEventOpenButton>
        <span className="truncate font-semibold">{companyName(companies, event.company_id)}</span>
      </span>
      <StatusBadge value={event.status} />
      <EditEntityButton type="event" id={event.event_id}>更新</EditEntityButton>
    </div>
  );
}

function EventRow({ event, companies, compact = false, showActions = false, timeZone = defaultTimeZone }: { event: SheetRow<JobEvent>; companies: SheetRow<Company>[]; compact?: boolean; showActions?: boolean; timeZone?: string }) {
  const date = eventDate(event, timeZone);
  const kind = eventKindLabel(event.event_type);
  const dateParts = eventRowDateParts(date, event, timeZone);
  const eventLabel = timelineEventLabel(event, event.event_type || kind);
  const columns = compact
    ? "grid-cols-[10.75rem_minmax(0,1fr)]"
    : showActions
      ? "grid-cols-[10.75rem_minmax(0,1fr)_8rem_9rem]"
      : "grid-cols-[10.75rem_minmax(0,1fr)_8rem]";

  return (
    <div className={`grid items-center gap-2 ${columns} ${compact ? "h-8 text-xs" : "px-4 py-3 text-sm"}`}>
      {dateParts ? (
        <span className="grid grid-cols-[2.25rem_2.25rem_6rem] items-center whitespace-nowrap font-semibold tabular-nums text-ink">
          <span>{dateParts.dateText}</span>
          <span>{dateParts.weekdayText}</span>
          <span>{dateParts.timeText}</span>
        </span>
      ) : (
        <span className="font-semibold text-ink">未定</span>
      )}
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${eventDot(event.event_type)}`} />
        <TimelineEventOpenButton
          eventId={event.event_id}
          className="max-w-[48%] truncate text-left font-bold hover:text-brand hover:underline"
          title={`${eventLabel} ${eventScheduleRangeLabel(event, timeZone)}`}
        >
          {eventLabel}
        </TimelineEventOpenButton>
        <span className="truncate font-semibold">{companyName(companies, event.company_id)}</span>
      </span>
      {!compact ? <StatusBadge value={event.status} /> : null}
      {showActions ? <EventActions eventId={event.event_id} /> : null}
    </div>
  );
}

function CompanyActions({ companyId }: { companyId: string }) {
  return (
    <span className="flex items-center gap-2">
      <EditEntityButton type="company" id={companyId} />
      <button type="button" onClick={() => saveLocalCompanyDelete({ company_id: companyId, label: "企業", created_at: new Date().toISOString() })} className="text-sm font-semibold text-red-600 hover:underline">削除</button>
    </span>
  );
}

function EventActions({ eventId }: { eventId: string }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <EditEntityButton type="event" id={eventId} />
      <button type="button" onClick={() => saveLocalEventDelete({ event_id: eventId, label: "予定", created_at: new Date().toISOString() })} className="text-sm font-semibold text-red-600 hover:underline">削除</button>
    </span>
  );
}

function saveCompanyDelete(company: SheetRow<Company>) {
  saveLocalCompanyDelete({
    company_id: company.company_id,
    label: company.company_name || "企業",
    created_at: new Date().toISOString()
  });
}

function Metric({ label, value, detail, icon: Icon, tone, valueSize = "normal" }: { label: string; value: string; detail?: string; icon: LucideIcon; tone: "blue" | "violet" | "emerald" | "amber"; valueSize?: "normal" | "small" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-600 ring-blue-100",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100"
  };

  return (
    <Card className="min-h-[72px] overflow-hidden px-3 py-2.5 shadow-sm">
      <div className="flex h-full items-center gap-2.5">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 ${tones[tone]}`}><Icon size={20} strokeWidth={2.2} /></span>
        <div className="min-w-0 overflow-hidden"><p className="text-xs font-semibold leading-tight text-muted">{label}</p><p className={`truncate ${valueSize === "small" ? "text-[22px]" : "text-[24px]"} font-semibold leading-none tracking-tight text-ink`}>{value}</p>{detail ? <p className="mt-1 truncate text-[11px] font-medium leading-tight text-muted">{detail}</p> : null}</div>
      </div>
    </Card>
  );
}

function ActivityTrendPanel({ items }: { items: MonthlyStat[] }) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden p-3 shadow-sm">
      <AnalyticsHeader number="1." title="活動推移（イベント数・時間）" description="全期間の活動量を月別に確認します。" />
      <ActivityTrendChart items={items} />
    </Card>
  );
}

function CorrelationPanel({
  title,
  countItems,
  passRateItems,
  target,
  onTargetChange
}: {
  title: string;
  countItems: Array<{ label: string; count: number }>;
  passRateItems: Array<{ label: string; passed: number; total: number; rate: number }>;
  target: "industry" | "source";
  onTargetChange: (target: "industry" | "source") => void;
}) {
  return (
    <Card className="min-h-0 overflow-hidden p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3"><AnalyticsHeader number="2." title="相性分析" description={`${title}ごとの応募数と通過率を確認します。`} /><SegmentedControl value={target} onChange={onTargetChange} options={[["industry", "業界別"], ["source", "応募媒体別"]]} /></div>
      <div className="mt-3 grid min-h-0 items-center justify-around gap-2 md:grid-cols-[360px_280px]"><DonutDistribution items={countItems} /><PassRateBars items={passRateItems} /></div>
    </Card>
  );
}

function SelectionResultSummary({ items }: { items: StatusSummaryItem[] }) {
  return (
    <Card className="min-h-0 overflow-hidden p-3 shadow-sm">
      <AnalyticsHeader number="3." title="選考結果サマリー" description="企業ステータスの内訳を確認できます。" />
      <div className="mt-2 grid grid-cols-5 divide-x divide-line">{items.map((item) => <StatusSummaryCell key={item.label} item={item} />)}</div>
    </Card>
  );
}

function EventTypeSummary({ items, total }: { items: EventTypeSummaryItem[]; total: number }) {
  return (
    <Card className="min-h-0 overflow-hidden p-3 shadow-sm">
      <AnalyticsHeader number="4." title="活動ログサマリー（イベント種別）" description="参加したイベントの内訳です。" />
      <div className="mt-2 grid grid-cols-5 divide-x divide-line">{items.map((item) => <EventTypeCell key={item.label} item={item} total={total} />)}</div>
    </Card>
  );
}

function ActivityPatternPanel({
  weekdayItems,
  timeItems,
  peakMonth,
  peakWeekday
}: {
  weekdayItems: Array<{ label: string; count: number }>;
  timeItems: Array<{ label: string; count: number }>;
  peakMonth: MonthlyStat;
  peakWeekday: { label: string; count: number };
}) {
  return (
    <Card className="min-h-0 overflow-hidden p-3 shadow-sm">
      <AnalyticsHeader number="5." title="活動傾向" description="曜日別・時間帯別の活動傾向を確認できます。" />
      <div className="mt-0 grid h-[130px] min-h-0 items-center gap-5 pr-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.06fr)_13rem]">
        <MiniVerticalBarChart title="曜日別イベント数" items={weekdayItems} />
        <HorizontalActivityBars title="時間帯別イベント数" items={timeItems} />
        <PeakSummary peakMonth={peakMonth} peakWeekday={peakWeekday} />
      </div>
    </Card>
  );
}

function AnalyticsHeader({ number, title, description, compact = false }: { number: string; title: string; description: string; compact?: boolean }) {
  return <div className="flex min-w-0 items-start gap-1.5"><span className="text-xs font-black leading-tight text-ink">{number}</span><div className="min-w-0"><h2 className={`${compact ? "text-[13px]" : "text-[15px]"} font-black leading-tight text-ink`}>{title}</h2><p className="mt-0.5 truncate text-[11px] font-semibold leading-tight text-muted">{description}</p></div></div>;
}

function SegmentedControl<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: Array<[T, string]> }) {
  return <span className="inline-flex shrink-0 rounded-lg border border-line bg-slate-50 p-0.5 text-[11px] font-bold">{options.map(([optionValue, label]) => <button key={optionValue} type="button" onClick={() => onChange(optionValue)} className={`rounded-md px-2 py-0.5 ${value === optionValue ? "bg-white text-brand shadow-sm" : "text-muted"}`}>{label}</button>)}</span>;
}

type MonthlyStat = { key: string; label: string; total: number; participation: number; minutes: number };

const donutColors = ["#2563eb", "#60a5fa", "#93c5fd", "#cbd5e1", "#64748b"];

function ActivityTrendChart({ items }: { items: MonthlyStat[] }) {
  const width = 720;
  const height = 196;
  const left = 34;
  const right = 30;
  const top = 20;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximumEvents = Math.max(1, ...items.map((item) => item.total));
  const maximumMinutes = Math.max(1, ...items.map((item) => item.minutes));
  const step = items.length > 1 ? plotWidth / (items.length - 1) : plotWidth / 2;
  const xFor = (index: number) => left + (items.length > 1 ? index * step : plotWidth / 2);
  const eventY = (value: number) => top + plotHeight - (value / maximumEvents) * plotHeight;
  const minuteY = (value: number) => top + plotHeight - (value / maximumMinutes) * plotHeight;
  const line = items.map((item, index) => `${xFor(index)},${minuteY(item.minutes)}`).join(" ");

  return (
    <div className="mt-1 flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-end gap-2.5 text-[10px] font-semibold text-muted"><span className="flex items-center gap-1.5"><i className="h-1.5 w-3 rounded-sm bg-blue-300" />イベント数</span><span className="flex items-center gap-1.5"><i className="h-0.5 w-3 bg-brand" />費やした時間</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} className="min-h-0 flex-1" preserveAspectRatio="none" role="img" aria-label="月別のイベント数と活動時間">
        {[0.25, 0.5, 0.75, 1].map((ratio) => <line key={ratio} x1={left} x2={width - right} y1={top + plotHeight * (1 - ratio)} y2={top + plotHeight * (1 - ratio)} stroke="#dbe3ee" strokeWidth="1" />)}
        <text x="0" y={top + 5} fill="#94a3b8" fontSize="10">件数</text><text x={width - 26} y={top + 5} fill="#94a3b8" fontSize="10">時間</text>
        {items.map((item, index) => {
          const x = xFor(index);
          const barWidth = Math.max(20, Math.min(38, plotWidth / Math.max(items.length, 1) / 2.15));
          const y = eventY(item.total);
          return <g key={item.key}>{item.total ? <><rect x={x - barWidth / 2} y={y} width={barWidth} height={top + plotHeight - y} rx="3" fill="#93c5fd" fillOpacity="0.68" /><text x={x} y={Math.max(top + 10, y - 5)} textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="700">{item.total}</text></> : null}<text x={x} y={height - 7} textAnchor="middle" fill="#64748b" fontSize="10" fontWeight="700">{item.label}</text></g>;
        })}
        {items.length > 1 ? <polyline points={line} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {items.map((item, index) => {
          const pointY = minuteY(item.minutes);
          const labelY = pointY < top + 18 ? pointY + 14 : pointY > top + plotHeight - 16 ? pointY - 8 : pointY + 14;
          return <g key={`${item.key}-minutes`}><circle cx={xFor(index)} cy={pointY} r="2.8" fill="#2563eb" stroke="white" strokeWidth="1.5" />{item.minutes ? <text x={xFor(index)} y={labelY} textAnchor="middle" fill="#2563eb" fontSize="9" fontWeight="700">{formatHoursShort(item.minutes)}</text> : null}</g>;
        })}
      </svg>
    </div>
  );
}

type StatusSummaryItem = { label: string; count: number; tone: string };
type EventTypeSummaryItem = { label: string; count: number; tone: string; icon: LucideIcon };

function DonutDistribution({ items }: { items: Array<{ label: string; count: number }> }) {
  const visible = items.filter((item) => item.count > 0).slice(0, 5);
  const remaining = items.slice(5).reduce((sum, item) => sum + item.count, 0);
  const chartItems = remaining ? [...visible, { label: "その他", count: remaining }] : visible;
  const total = chartItems.reduce((sum, item) => sum + item.count, 0);
  let cursor = 0;
  const stops = chartItems.map((item, index) => {
    const start = cursor;
    cursor += total ? (item.count / total) * 100 : 0;
    return `${donutColors[index % donutColors.length]} ${start}% ${cursor}%`;
  });

  return total ? <div className="grid w-[360px] grid-cols-[140px_minmax(0,1fr)] items-center gap-1.5"><div className="relative grid h-[140px] w-[140px] place-items-center rounded-full" style={{ background: `conic-gradient(${stops.join(",")})` }}><div className="grid h-[88px] w-[88px] place-items-center rounded-full bg-white text-center"><span className="text-xl font-black leading-none text-ink">{total}</span><span className="-mt-1 text-[11px] font-bold text-muted">社</span></div></div><div className="min-w-0"><p className="mb-1 text-[11px] font-bold text-muted">応募数 上位5件</p><div className="grid gap-0.5">{chartItems.map((item, index) => <div key={item.label} className="grid h-6 grid-cols-[0.5rem_minmax(0,1fr)_2.5rem] grid-rows-2 items-center gap-x-1 text-[11px] leading-[13px]"><i className="row-span-2 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: donutColors[index % donutColors.length] }} /><span className="truncate font-semibold text-ink">{item.label}</span><span className="text-right font-bold text-muted">{Math.round((item.count / total) * 100)}%</span><span className="col-start-2 text-right font-semibold text-muted">{item.count}社</span></div>)}</div></div></div> : <p className="py-8 text-center text-xs font-semibold text-muted">データがありません。</p>;
}

function PassRateBars({ items }: { items: Array<{ label: string; passed: number; total: number; rate: number }> }) {
  return <div className="w-[280px] min-w-0"><p className="mb-1 text-left text-[11px] font-bold text-muted">通過率 上位5件</p>{items.length ? <div className="grid gap-2">{items.slice(0, 5).map((item) => <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_2.35rem_2.35rem] items-center gap-x-1.5 gap-y-0.5"><span className="truncate text-left text-[11px] font-semibold leading-tight text-ink">{item.label}</span><span className="text-right text-[11px] font-black leading-tight text-brand">{item.rate}%</span><span className="text-right text-[11px] font-semibold leading-tight text-muted">{item.passed}/{item.total}</span><div className="col-span-3 h-2 w-[220px] overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${item.rate}%` }} /></div></div>)}</div> : <p className="py-5 text-center text-xs font-semibold text-muted">結果確定イベントがありません。</p>}</div>;
}

function StatusSummaryCell({ item }: { item: StatusSummaryItem }) {
  return <div className={`flex min-w-0 flex-col justify-center px-3 py-2 ${item.count === 0 ? "opacity-[0.65]" : ""}`}><div className="flex items-center justify-center gap-1.5"><span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full ${item.tone}`}><i className="h-1.5 w-1.5 rounded-full bg-current" /></span><p className="truncate text-xs font-semibold leading-tight text-muted">{item.label}</p></div><p className="mt-[5px] text-center text-base font-bold leading-tight text-ink">{item.count}社</p></div>;
}

function EventTypeCell({ item, total }: { item: EventTypeSummaryItem; total: number }) {
  const Icon = item.icon;
  return <div className="flex min-w-0 flex-col justify-center px-3 py-2"><div className="flex items-center justify-center gap-1.5"><span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md ${item.tone}`}><Icon size={12} strokeWidth={2.2} /></span><p className="truncate text-xs font-semibold leading-tight text-muted">{item.label}</p></div><p className="mt-[5px] text-center text-base font-bold leading-tight text-ink">{item.count}</p><p className="text-center text-[11px] font-semibold leading-tight text-muted">{total ? Math.round((item.count / total) * 100) : 0}%</p></div>;
}

function MiniVerticalBarChart({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  const maximum = Math.max(1, ...items.map((item) => item.count));
  return <div className="min-w-0"><h3 className="text-xs font-black leading-tight text-ink">{title}</h3><div className="mt-1.5 grid h-[74px] items-end gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}>{items.map((item) => <div key={item.label} className="flex h-full min-w-0 flex-col justify-end"><span className="mb-1 text-center text-[11px] font-black text-ink">{item.count}</span><div className="rounded-t bg-blue-400" style={{ height: `${Math.max(5, (item.count / maximum) * 48)}px` }} /><span className="mt-1 text-center text-[11px] font-bold text-muted">{item.label}</span></div>)}</div></div>;
}

function HorizontalActivityBars({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  const maximum = Math.max(1, ...items.map((item) => item.count));
  return <div className="min-w-0"><h3 className="text-xs font-black leading-tight text-ink">{title}</h3><div className="mt-1.5 grid gap-1.5">{items.map((item) => <div key={item.label} className="grid grid-cols-[3rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs"><span className="font-semibold leading-tight text-muted">{shortTimeOfDayLabel(item.label)}</span><div className="h-2 max-w-[92%] overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${(item.count / maximum) * 100}%` }} /></div><span className="text-right font-black text-ink">{item.count}</span></div>)}</div></div>;
}

function shortTimeOfDayLabel(label: string) {
  if (label.startsWith("午前")) return "午前";
  if (label.startsWith("昼")) return "昼";
  if (label.startsWith("午後")) return "午後";
  if (label.startsWith("夜")) return "夜";
  return label;
}

function PeakSummary({ peakMonth, peakWeekday }: { peakMonth: MonthlyStat; peakWeekday: { label: string; count: number } }) {
  return <div className="grid h-full min-h-0 grid-cols-2 divide-x divide-line overflow-hidden rounded-lg border border-line bg-white shadow-sm xl:grid-cols-1 xl:divide-x-0 xl:divide-y"><PeakCell icon={Trophy} tone="text-amber-500 bg-amber-50 ring-amber-100" label="ピーク月" value={peakMonth.label} detail={`イベント数 ${peakMonth.total}件`} /><PeakCell icon={CalendarDays} tone="text-violet-600 bg-violet-50 ring-violet-100" label="最多活動曜日" value={peakWeekday.label} detail={`イベント数 ${peakWeekday.count}件`} /></div>;
}

function PeakCell({ icon: Icon, tone, label, value, detail }: { icon: LucideIcon; tone: string; label: string; value: string; detail: string }) {
  return <div className="flex min-w-0 items-center gap-2 px-2.5 py-3"><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ring-1 ${tone}`}><Icon size={13} strokeWidth={2.3} /></span><div className="min-w-0"><p className="text-[11px] font-bold leading-tight text-muted">{label}</p><p className="truncate text-base font-black leading-tight text-ink">{value}</p><p className="truncate text-[11px] font-semibold leading-tight text-muted">{detail}</p></div></div>;
}

function breakdown(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ja"));
}

function buildPassRateBreakdown(
  events: SheetRow<JobEvent>[],
  companyById: Map<string, SheetRow<Company>>,
  field: "industry" | "application_source"
) {
  const values = new Map<string, { passed: number; total: number }>();
  for (const event of events) {
    if (eventColorGroup(event.event_type) !== "selection") continue;
    const isPassed = matchesStatus(event.status, "通過", "通過");
    const isRejected = matchesStatus(event.status, "落選", "落選");
    if (!isPassed && !isRejected) continue;
    const company = companyById.get(event.company_id);
    const label = company?.[field] || "未設定";
    const current = values.get(label) ?? { passed: 0, total: 0 };
    current.total += 1;
    if (isPassed) current.passed += 1;
    values.set(label, current);
  }

  return [...values.entries()]
    .map(([label, value]) => ({ label, ...value, rate: Math.round((value.passed / value.total) * 100) }))
    .sort((left, right) => right.rate - left.rate || right.total - left.total || left.label.localeCompare(right.label, "ja"));
}

function buildCompanyStatusSummary(companies: SheetRow<Company>[], eventsByCompanyId: Map<string, SheetRow<JobEvent>[]>): StatusSummaryItem[] {
  const definitions: Array<{ label: string; tone: string }> = [
    { label: "検討中", tone: "bg-slate-100 text-slate-700" },
    { label: "選考中", tone: "bg-blue-50 text-blue-700" },
    { label: "辞退", tone: "bg-amber-50 text-amber-700" },
    { label: "落選", tone: "bg-red-50 text-red-700" },
    { label: "内定", tone: "bg-violet-50 text-violet-700" }
  ];
  return definitions.map((definition) => ({
    ...definition,
    count: companies.filter((company) => effectiveCompanyStatus(company, eventsByCompanyId.get(company.company_id) ?? []) === definition.label).length
  }));
}

function buildEventTypeSummary(events: SheetRow<JobEvent>[]): EventTypeSummaryItem[] {
  const definitions: Array<{ label: string; tone: string; icon: LucideIcon; matches: (event: SheetRow<JobEvent>) => boolean }> = [
    { label: "提出", tone: "bg-sky-50 text-sky-700", icon: FileBarChart2, matches: (event) => eventColorGroup(event.event_type) === "submission" },
    { label: "テスト", tone: "bg-emerald-50 text-emerald-700", icon: Activity, matches: (event) => eventColorGroup(event.event_type) === "test" },
    { label: "参加", tone: "bg-violet-50 text-violet-700", icon: BriefcaseBusiness, matches: (event) => eventColorGroup(event.event_type) === "participation" },
    { label: "選考", tone: "bg-amber-50 text-amber-800", icon: CheckCircle2, matches: (event) => eventColorGroup(event.event_type) === "selection" },
    { label: "その他", tone: "bg-slate-100 text-slate-600", icon: PieChart, matches: (event) => eventColorGroup(event.event_type) === "other" }
  ];
  return definitions.map((definition) => ({ label: definition.label, tone: definition.tone, icon: definition.icon, count: events.filter(definition.matches).length }));
}

function buildWeekdayStats(events: SheetRow<JobEvent>[]) {
  const labels = ["日", "月", "火", "水", "木", "金", "土"];
  const counts = Array.from({ length: 7 }, () => 0);
  for (const event of events) {
    const date = eventDate(event);
    if (date) counts[date.getDay()] += 1;
  }
  return labels.map((label, index) => ({ label, count: counts[index] }));
}

function buildTimeOfDayStats(events: SheetRow<JobEvent>[]) {
  const groups = [
    { label: "午前（〜12時）", count: 0 },
    { label: "昼（12〜15時）", count: 0 },
    { label: "午後（15〜18時）", count: 0 },
    { label: "夜（18時〜）", count: 0 }
  ];
  for (const event of events) {
    if (isDateOnlyEvent(event)) continue;
    const date = eventDate(event);
    if (!date) continue;
    const hour = date.getHours();
    const index = hour < 12 ? 0 : hour < 15 ? 1 : hour < 18 ? 2 : 3;
    groups[index].count += 1;
  }
  return groups;
}

function buildMonthlyStats(events: SheetRow<JobEvent>[]): MonthlyStat[] {
  const months = new Map<string, { total: number; participation: number; minutes: number }>();
  for (const event of events) {
    const date = eventDate(event);
    if (!date) continue;
    const key = `${date.getFullYear()}/${date.getMonth() + 1}`;
    const current = months.get(key) ?? { total: 0, participation: 0, minutes: 0 };
    current.total += 1;
    if (eventColorGroup(event.event_type) === "participation") current.participation += 1;
    current.minutes += completedEventMinutes(event);
    months.set(key, current);
  }
  const keys = [...months.keys()].sort((left, right) => new Date(`${left}/1`).getTime() - new Date(`${right}/1`).getTime());
  if (!keys.length) return [];

  const [firstYear, firstMonth] = keys[0].split("/").map(Number);
  const [lastYear, lastMonth] = keys[keys.length - 1].split("/").map(Number);
  const current = new Date(firstYear, firstMonth - 1, 1);
  const last = new Date(lastYear, lastMonth - 1, 1);
  const continuous: MonthlyStat[] = [];

  while (current <= last) {
    const key = `${current.getFullYear()}/${current.getMonth() + 1}`;
    const values = months.get(key) ?? { total: 0, participation: 0, minutes: 0 };
    continuous.push({ key, label: `${current.getMonth() + 1}月`, ...values });
    current.setMonth(current.getMonth() + 1);
  }

  return continuous.slice(-8);
}

function completedEventMinutes(event: SheetRow<JobEvent>) {
  if (isDateOnlyEvent(event) || matchesStatus(event.status, "予定", "予定") || !event.start_datetime || !event.end_datetime) return 0;
  const start = new Date(event.start_datetime.replace(" ", "T"));
  const end = new Date(event.end_datetime.replace(" ", "T"));
  const minutes = end.getTime() - start.getTime();
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes / 60_000) : 0;
}

function formatHours(minutes: number) {
  if (!minutes) return "0時間";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
}

function formatHoursShort(minutes: number) {
  if (!minutes) return "0h";
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours}h`;
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

function companyStatusRibbonClass(status: string) {
  const tone = statusTone(status);

  if (tone.includes("green")) return "border-l-green-500";
  if (tone.includes("red")) return "border-l-red-500";
  if (tone.includes("amber")) return "border-l-amber-500";
  if (tone.includes("purple")) return "border-l-purple-500";
  if (tone.includes("violet")) return "border-l-violet-500";
  if (tone.includes("blue")) return "border-l-brand";
  return "border-l-slate-300";
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-center justify-between ${strong ? "border-t border-line pt-2 font-bold" : "font-semibold"}`}><span className="text-muted">{label}</span><span className="text-ink">{value}</span></div>;
}

function Notice({ tone, title, children }: { tone: "ok" | "warn" | "danger"; title: string; children: React.ReactNode }) {
  const styles = { ok: "border-green-200 bg-green-50 text-green-700", warn: "border-amber-200 bg-amber-50 text-amber-800", danger: "border-red-200 bg-red-50 text-red-700" };
  return <section className={`rounded-xl border p-4 text-sm shadow-sm ${styles[tone]}`}><p className="font-semibold">{title}</p><div className="mt-1">{children}</div></section>;
}

function openAdd(mode: "company" | "event", companyId?: string, date?: string) {
  window.dispatchEvent(new CustomEvent("job-hunt-note:add", { detail: companyId || date ? { mode, companyId, date } : mode }));
}

function formatDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseDateKey(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  const parsed = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function eventDot(eventType: string) {
  const tone = eventTypeTone(eventType);
  if (tone.includes("sky")) return "bg-sky-500";
  if (tone.includes("emerald")) return "bg-emerald-500";
  if (tone.includes("violet")) return "bg-violet-500";
  if (tone.includes("amber")) return "bg-amber-500";
  const kind = eventKindLabel(eventType);
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

function dateOnlyMarker(status: string) {
  return status.includes("予定") ? "○" : "✓";
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function eventRowDateParts(date: Date | null, event: SheetRow<JobEvent>, displayTimeZone: string) {
  if (!date) return null;
  if (isDateOnlyEvent(event)) {
    return {
      dateText: relativeUpcomingDateText(date),
      weekdayText: `（${weekday(date)}）`,
      timeText: ""
    };
  }

  const end = event.end_datetime
    ? convertZonedDateTime(event.end_datetime, event.timezone || defaultTimeZone, displayTimeZone)
    : null;
  const startTime = formatTime(date);
  const endTime = end && startOfDay(date).getTime() === startOfDay(end).getTime()
    ? `〜${formatTime(end)}`
    : "";

  return {
    dateText: relativeUpcomingDateText(date),
    weekdayText: `（${weekday(date)}）`,
    timeText: `${startTime}${endTime}`
  };
}

function relativeUpcomingDateText(date: Date) {
  const today = startOfDay(new Date());
  const diff = dayDiff(today, date);
  if (diff === 0) return "\u672c\u65e5";
  if (diff === 1) return "\u660e\u65e5";
  return `${date.getMonth() + 1}/${date.getDate()}`;
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
