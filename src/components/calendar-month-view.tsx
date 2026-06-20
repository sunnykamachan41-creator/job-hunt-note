"use client";

import { useMemo, useRef, useState } from "react";

import { useLocalCompanyDrafts, useLocalCompanyUpdates, useLocalEventDrafts, useLocalEventUpdates } from "@/components/local-draft-sync-panel";
import type { SheetRow } from "@/lib/google-sheets";
import {
  eventDate,
  eventKindLabel,
  eventTimeLabel,
  eventTypeTone,
  isInactiveStatus,
  sortEventsBySchedule
} from "@/lib/planning";
import type { Company } from "@/types/company";
import type { JobEvent } from "@/types/event";

const wheelThreshold = 140;
const wheelCooldownMs = 520;

export function CalendarMonthView({
  companies,
  events,
  selectedEventId,
  monthParam,
  timeZone = "Asia/Tokyo"
}: {
  companies: SheetRow<Company>[];
  events: SheetRow<JobEvent>[];
  selectedEventId?: string;
  monthParam?: string;
  timeZone?: string;
}) {
  const wheelTotal = useRef(0);
  const wheelLockedUntil = useRef(0);
  const [visibleMonth, setVisibleMonth] = useState(() => parseMonthParam(monthParam));
  const month = useMemo(() => monthModel(visibleMonth), [visibleMonth]);
  const localDrafts = useLocalEventDrafts();
  const localUpdates = useLocalEventUpdates();
  const localCompanies = useLocalCompanyDrafts();
  const localCompanyUpdates = useLocalCompanyUpdates();
  const visibleCompanies = useMemo(
    () => {
      const existingCompanyIds = new Set(companies.map((company) => company.company_id));
      const pendingCompanies = localCompanies.filter((company) => !existingCompanyIds.has(company.company_id));

      return [
      ...pendingCompanies.map((company) => ({
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
      ...applyCompanyUpdates(companies, localCompanyUpdates)
    ];
    },
    [companies, localCompanies, localCompanyUpdates]
  );
  const visibleEvents = useMemo(
    () => {
      const existingEventIds = new Set(events.map((event) => event.event_id));
      const pendingDrafts = localDrafts.filter((draft) => !existingEventIds.has(draft.draft_id));

      return [...applyEventUpdates(events, localUpdates), ...pendingDrafts.map(draftToEventRow)];
    },
    [events, localDrafts, localUpdates]
  );
  const companyNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const company of visibleCompanies) {
      map.set(company.company_id, company.company_name);
    }
    return map;
  }, [visibleCompanies]);
  const eventsByDateKey = useMemo(
    () => groupEventsByDateKey(visibleEvents, timeZone),
    [timeZone, visibleEvents]
  );

  function moveMonth(offset: number) {
    const next = new Date(month.year, month.month + offset, 1);
    setVisibleMonth(next);
  }

  function moveToday() {
    setVisibleMonth(new Date());
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
      return;
    }

    event.preventDefault();
    const now = Date.now();

    if (now < wheelLockedUntil.current) {
      return;
    }

    wheelTotal.current += event.deltaY;

    if (Math.abs(wheelTotal.current) < wheelThreshold) {
      return;
    }

    moveMonth(wheelTotal.current > 0 ? 1 : -1);
    wheelTotal.current = 0;
    wheelLockedUntil.current = now + wheelCooldownMs;
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[52px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={moveToday}
            className="h-9 rounded-full border border-line bg-white px-4 text-sm font-bold text-ink shadow-sm hover:bg-slate-50"
          >
            今日
          </button>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => moveMonth(-1)} className="flex h-9 w-9 items-center justify-center rounded-full text-2xl font-semibold text-muted hover:bg-slate-100">‹</button>
            <button type="button" onClick={() => moveMonth(1)} className="flex h-9 w-9 items-center justify-center rounded-full text-2xl font-semibold text-muted hover:bg-slate-100">›</button>
          </div>
          <h2 className="text-2xl font-bold text-ink">{month.year}年 {month.month + 1}月</h2>
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <p className="text-xs font-semibold text-muted">ホイールで月を切り替え</p>
          <span className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold text-muted shadow-sm">
            {timeZoneLabel(timeZone)}
          </span>
        </div>
      </div>

      <div className="grid min-h-0 grid-rows-[32px_minmax(0,1fr)] px-3 pb-3 pt-0" onWheel={onWheel}>
        <div className="grid grid-cols-7 text-center text-xs font-bold text-muted">
          {["日", "月", "火", "水", "木", "金", "土"].map((day, index) => (
            <div key={day} className={`flex items-center justify-center border-r border-line last:border-r-0 ${index === 0 ? "text-red-500" : index === 6 ? "text-brand" : ""}`}>
              {day}
            </div>
          ))}
        </div>
        <div className="grid min-h-0 grid-cols-7 grid-rows-6 overflow-hidden rounded-b-2xl border border-line">
          {month.days.map((day) => {
            const dayEvents = eventsByDateKey.get(dateKey(day.date)) ?? [];

            return (
              <div
                key={day.key}
                className={`min-w-0 overflow-hidden border-r border-t border-line p-2 last:border-r-0 ${day.inMonth ? "bg-white" : "bg-slate-50 text-subtle"}`}
              >
                <div className="mb-1 flex h-6 items-center justify-center">
                  <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold ${isSameDay(day.date, new Date()) ? "bg-brand text-white" : "text-ink"}`}>
                    {day.date.getDate()}
                  </span>
                </div>
                <div className="grid min-w-0 gap-1">
                  {dayEvents.slice(0, 5).map((event, index) => (
                    <CalendarEventPill
                      key={`${day.key}-${event.event_id}-${index}`}
                      event={event}
                      companyName={companyNameById.get(event.company_id) ?? "未設定"}
                      timeZone={timeZone}
                      selected={selectedEventId === event.event_id}
                    />
                  ))}
                  {dayEvents.length > 5 ? (
                    <span className="truncate px-1 text-[11px] font-semibold text-muted">他 {dayEvents.length - 5}件</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CalendarEventPill({
  event,
  companyName: name,
  timeZone,
  selected
}: {
  event: SheetRow<JobEvent>;
  companyName: string;
  timeZone: string;
  selected: boolean;
}) {
  const label = `${eventTimeLabel(event, timeZone)} ${name} | ${event.title || eventKindLabel(event.event_type)}`;

  return (
    <button
      type="button"
      onClick={(clickEvent) => {
        const rect = clickEvent.currentTarget.getBoundingClientRect();
        window.dispatchEvent(new CustomEvent("job-hunt-note:timeline-event-open", {
          detail: {
            eventId: event.event_id,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height
          }
        }));
      }}
      className={`block w-full min-w-0 truncate rounded-md border px-1.5 py-1 text-left text-[11px] font-semibold leading-none ${eventTypeTone(event.event_type)} ${selected ? "ring-2 ring-brand" : ""} ${isInactiveStatus(event.status) ? "opacity-50" : ""}`}
      title={label}
    >
      {label}
    </button>
  );
}

function parseMonthParam(value?: string) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return new Date();
  }

  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function monthModel(target: Date) {
  const year = target.getFullYear();
  const month = target.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = addDays(firstDay, -firstDay.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);

    return {
      key: date.toISOString(),
      date,
      inMonth: date.getMonth() === month
    };
  });

  return { year, month, days };
}

function groupEventsByDateKey(events: SheetRow<JobEvent>[], timeZone = "Asia/Tokyo") {
  const grouped = new Map<string, SheetRow<JobEvent>[]>();

  for (const event of events) {
    const start = eventDate(event, timeZone);

    if (!start) continue;

    if (event.is_period === "true" && event.period_end_date) {
      const end = new Date(`${event.period_end_date}T23:59`);
      let cursor = startOfDay(start);
      const last = startOfDay(end);

      while (cursor.getTime() <= last.getTime()) {
        pushGroupedEvent(grouped, dateKey(cursor), event);
        cursor = addDays(cursor, 1);
      }
      continue;
    }

    pushGroupedEvent(grouped, dateKey(start), event);
  }

  for (const [key, list] of grouped) {
    grouped.set(key, sortEventsBySchedule(list, timeZone));
  }

  return grouped;
}

function pushGroupedEvent(grouped: Map<string, SheetRow<JobEvent>[]>, key: string, event: SheetRow<JobEvent>) {
  const list = grouped.get(key);
  if (list) {
    if (list.some((item) => item.event_id === event.event_id)) {
      return;
    }
    list.push(event);
  } else {
    grouped.set(key, [event]);
  }
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function draftToEventRow(draft: ReturnType<typeof useLocalEventDrafts>[number]): SheetRow<JobEvent> {
  return {
    _rowNumber: -1,
    event_id: draft.draft_id,
    company_id: draft.company_id,
    selection_type: draft.selection_type || "本選考",
    event_type: draft.event_type,
    title: draft.title,
    start_datetime: draft.start_datetime,
    end_datetime: draft.end_datetime,
    timezone: draft.timezone || "Asia/Tokyo",
    is_period: draft.is_period,
    period_end_date: draft.period_end_date,
    status: draft.status,
    person: draft.person,
    meeting_url: draft.meeting_url,
    memo: draft.memo ? `${draft.memo}\n未同期` : "未同期",
    sync_to_calendar: draft.sync_to_calendar,
    google_calendar_event_id: "",
    calendar_last_synced_at: "",
    created_at: draft.created_at,
    updated_at: draft.created_at
  };
}

function applyEventUpdates(events: SheetRow<JobEvent>[], updates: ReturnType<typeof useLocalEventUpdates>) {
  if (!updates.length) return events;
  const updateMap = new Map(updates.map((update) => [update.event_id, update]));

  return events.map((event) => {
    const update = updateMap.get(event.event_id);
    return update
      ? {
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
        memo: update.memo ? `${update.memo}\n未同期編集` : "未同期編集",
        sync_to_calendar: update.sync_to_calendar
      }
      : event;
  });
}

function applyCompanyUpdates(companies: SheetRow<Company>[], updates: ReturnType<typeof useLocalCompanyUpdates>) {
  if (!updates.length) return companies;
  const updateMap = new Map(updates.map((update) => [update.company_id, update]));

  return companies.map((company) => {
    const update = updateMap.get(company.company_id);
    return update
      ? {
        ...company,
        company_name: `${update.company_name}（未同期編集）`,
        industry: update.industry,
        status: update.status,
        mypage_url: update.mypage_url,
        memo: update.memo,
        application_source: update.application_source
      }
      : company;
  });
}

function timeZoneLabel(value: string) {
  if (value === "Asia/Tokyo") return "GMT+09:00 日本標準時";
  if (value === "UTC") return "GMT+00:00 UTC";
  if (value === "America/Los_Angeles") return "GMT-08:00 Pacific";
  if (value === "America/New_York") return "GMT-05:00 Eastern";
  if (value === "Europe/London") return "GMT+00:00 London";
  return value;
}
