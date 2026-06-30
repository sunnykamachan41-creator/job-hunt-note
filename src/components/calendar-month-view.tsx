"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  saveLocalEventUpdate,
  type LocalEventUpdateDraft,
  useLocalCompanyDrafts,
  useLocalCompanyUpdates,
  useLocalEventDrafts,
  useLocalEventUpdates
} from "@/components/local-draft-sync-panel";
import type { SheetRow } from "@/lib/google-sheets";
import {
  eventDate,
  eventKindLabel,
  eventScheduleRangeLabel,
  isDateOnlyEvent,
  eventTimeLabel,
  eventTypeTone,
  sortEventsBySchedule
} from "@/lib/planning";
import type { Company } from "@/types/company";
import type { JobEvent } from "@/types/event";

const wheelThreshold = 140;
const wheelCooldownMs = 520;
const addPreviewEventName = "job-hunt-note:event-add-preview";
const clearPreviewEventName = "job-hunt-note:event-preview-clear";
const addPreviewChangeEventName = "job-hunt-note:event-add-preview-change";

type CalendarDraftPreview = {
  date: string;
  companyId?: string;
  startDatetime?: string;
  endDatetime?: string;
};

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
  const daySwipeStart = useRef<{ x: number; y: number } | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => parseMonthParam(monthParam));
  const [viewMode, setViewMode] = useState<"month" | "day">("month");
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [draftPreview, setDraftPreview] = useState<CalendarDraftPreview | null>(null);
  const month = useMemo(() => monthModel(visibleMonth), [visibleMonth]);
  const localDrafts = useLocalEventDrafts();
  const localUpdates = useLocalEventUpdates();
  const localCompanies = useLocalCompanyDrafts();
  const localCompanyUpdates = useLocalCompanyUpdates();
  const visibleCompanies = useMemo(
    () => {
      const existingCompanyIds = new Set(companies.map((company) => company.company_id));
      const pendingCompanies = localCompanies.filter((company) => !company.synced_at && !existingCompanyIds.has(company.company_id));

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
      const pendingDrafts = localDrafts.filter((draft) => !draft.synced_at && !existingEventIds.has(draft.draft_id));

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

  useEffect(() => {
    function onPreview(event: Event) {
      const detail = (event as CustomEvent<CalendarDraftPreview>).detail;
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

  function moveMonth(offset: number) {
    const next = new Date(month.year, month.month + offset, 1);
    setVisibleMonth(next);
  }

  function moveDay(offset: number) {
    const next = addDays(selectedDate, offset);
    setSelectedDate(startOfDay(next));
    setVisibleMonth(next);
  }

  function moveToday() {
    const today = new Date();
    setVisibleMonth(today);
    if (viewMode === "day") {
      setSelectedDate(startOfDay(today));
    }
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (viewMode === "day") {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
        return;
      }

      event.preventDefault();
      const now = Date.now();

      if (now < wheelLockedUntil.current) {
        return;
      }

      wheelTotal.current += event.deltaX;

      if (Math.abs(wheelTotal.current) < wheelThreshold) {
        return;
      }

      moveDay(wheelTotal.current > 0 ? 1 : -1);
      wheelTotal.current = 0;
      wheelLockedUntil.current = now + wheelCooldownMs;
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

  function openDay(date: Date) {
    setSelectedDate(startOfDay(date));
    setVisibleMonth(date);
    setViewMode("day");
  }

  function openEventAddForDate(date: Date, startDatetime?: string, endDatetime?: string, timeMode?: string) {
    setDraftPreview({ date: dateKey(date), startDatetime, endDatetime });
    window.dispatchEvent(new CustomEvent("job-hunt-note:add", {
      detail: {
        mode: "event",
        date: dateKey(date),
        startDatetime,
        endDatetime,
        timeMode
      }
    }));
  }

  function onDayPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = daySwipeStart.current;
    daySwipeStart.current = null;
    if (!start) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    moveDay(dx < 0 ? 1 : -1);
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
            <button type="button" onClick={() => viewMode === "day" ? moveDay(-1) : moveMonth(-1)} className="flex h-9 w-9 items-center justify-center rounded-full text-2xl font-semibold text-muted hover:bg-slate-100">‹</button>
            <button type="button" onClick={() => viewMode === "day" ? moveDay(1) : moveMonth(1)} className="flex h-9 w-9 items-center justify-center rounded-full text-2xl font-semibold text-muted hover:bg-slate-100">›</button>
          </div>
          <h2 className="text-2xl font-bold text-ink">
            {viewMode === "day" ? formatDayTitle(selectedDate) : `${month.year}年 ${month.month + 1}月`}
          </h2>
        </div>
        <div className="hidden items-center gap-3 md:flex">
          {viewMode === "day" ? (
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className="h-9 rounded-full border border-line bg-white px-4 text-xs font-bold text-ink shadow-sm hover:bg-slate-50"
            >
              月表示
            </button>
          ) : (
            <p className="text-xs font-semibold text-muted">ホイールで月を切り替え</p>
          )}
          <span className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold text-muted shadow-sm">
            {timeZoneLabel(timeZone)}
          </span>
        </div>
      </div>

      {viewMode === "day" ? (
        <div
          className="min-h-0 px-3 pb-3 pt-0"
          onWheel={onWheel}
          onPointerDown={(event) => {
            daySwipeStart.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={onDayPointerUp}
          onPointerCancel={() => {
            daySwipeStart.current = null;
          }}
        >
          <CalendarDayView
            date={selectedDate}
            events={eventsByDateKey.get(dateKey(selectedDate)) ?? []}
            companyNameById={companyNameById}
            selectedEventId={selectedEventId}
            timeZone={timeZone}
            draftPreview={draftPreview?.date === dateKey(selectedDate) ? draftPreview : null}
            onAdd={(startDatetime, endDatetime, timeMode) => openEventAddForDate(selectedDate, startDatetime, endDatetime, timeMode)}
          />
        </div>
      ) : (
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
                  onClick={() => openEventAddForDate(day.date)}
                  className={`min-w-0 overflow-hidden border-r border-t border-line p-2 last:border-r-0 ${day.inMonth ? "bg-white" : "bg-slate-50 text-subtle"}`}
                >
                  <div className="mb-1 flex h-6 items-center justify-center">
                    <button
                      type="button"
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        openDay(day.date);
                      }}
                      className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold hover:bg-brand/10 ${isSameDay(day.date, new Date()) ? "bg-brand text-white hover:bg-brand" : "text-ink"}`}
                    >
                      {day.date.getDate()}
                    </button>
                  </div>
                  <div className="grid min-w-0 gap-1">
                    {draftPreview?.date === dateKey(day.date) ? (
                      <span className="block w-full min-w-0 truncate rounded-md border border-dashed border-slate-300 bg-white px-1.5 py-1 text-left text-[11px] font-semibold leading-none text-muted shadow-sm">
                        仮予定
                      </span>
                    ) : null}
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
      )}
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
  const dateOnly = isDateOnlyEvent(event);
  const title = `${name} | ${event.title || eventKindLabel(event.event_type)}`;
  const label = dateOnly ? `${dateOnlyMarker(event.status)} ${title}` : `${eventTimeLabel(event, timeZone)} ${title}`;

  return (
    <button
      type="button"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        const rect = clickEvent.currentTarget.getBoundingClientRect();
        window.dispatchEvent(new CustomEvent("job-hunt-note:timeline-event-open", {
          detail: {
            eventId: event.event_id,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height
          }
        }));
      }}
      className={dateOnly
        ? `block w-full min-w-0 truncate rounded-md border px-1.5 py-1 text-left text-[11px] font-semibold leading-none ${eventTypeTone(event.event_type)} ${selected ? "ring-2 ring-brand" : ""}`
        : `flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-1 text-left text-[11px] font-semibold leading-none hover:bg-slate-50 ${selected ? "ring-2 ring-brand" : ""}`}
      title={label}
    >
      {dateOnly ? label : (
        <>
          <span className={`h-2 w-2 shrink-0 rounded-full ${calendarEventDotClass(event.event_type)}`} />
          <span className="min-w-0 truncate">{label}</span>
        </>
      )}
    </button>
  );
}

function CalendarDayView({
  date,
  events,
  companyNameById,
  selectedEventId,
  timeZone,
  draftPreview,
  onAdd
}: {
  date: Date;
  events: SheetRow<JobEvent>[];
  companyNameById: Map<string, string>;
  selectedEventId?: string;
  timeZone: string;
  draftPreview?: CalendarDraftPreview | null;
  onAdd: (startDatetime?: string, endDatetime?: string, timeMode?: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draggingEvent, setDraggingEvent] = useState<DraggingEventState | null>(null);
  const [draggingPreview, setDraggingPreview] = useState<DraggingPreviewState | null>(null);
  const sortedEvents = useMemo(() => sortEventsBySchedule(events, timeZone), [events, timeZone]);
  const dateOnlyEvents = sortedEvents.filter(isDateOnlyEvent);
  const timedEvents = sortedEvents.filter((event) => !isDateOnlyEvent(event) && eventDate(event, timeZone));
  const hourHeight = 58;
  const timedModels = useMemo(() => buildDayEventModels(timedEvents, timeZone), [timedEvents, timeZone]);
  const startHour = 0;
  const endHour = 24;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
  const gridHeight = Math.max(1, endHour - startHour) * hourHeight;
  const now = new Date();
  const showNow = isSameDay(date, now) && now.getHours() >= startHour && now.getHours() <= endHour;
  const nowTop = (decimalHour(now) - startHour) * hourHeight;
  const previewStart = draftPreview?.startDatetime ? parseDateTimeValue(draftPreview.startDatetime) : null;
  const previewEnd = draftPreview?.endDatetime ? parseDateTimeValue(draftPreview.endDatetime) : null;
  const previewDateOnly = Boolean(draftPreview && !draftPreview.endDatetime);
  const renderPreviewStart = draggingPreview?.start ?? previewStart;
  const renderPreviewEnd = draggingPreview?.end ?? previewEnd;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 8.5 * hourHeight });
  }, [date]);

  function finishDrag() {
    if (!draggingEvent) return;
    saveLocalEventUpdate(eventToLocalUpdate(draggingEvent.event, draggingEvent.start, draggingEvent.end, timeZone));
    setDraggingEvent(null);
  }

  function emitPreviewChange(start: Date, end: Date) {
    window.dispatchEvent(new CustomEvent(addPreviewChangeEventName, {
      detail: {
        date: dateKey(start),
        companyId: draftPreview?.companyId,
        startDatetime: formatDateTimeValue(start),
        endDatetime: formatDateTimeValue(end)
      }
    }));
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-b-2xl border border-line bg-white">
      <div className="border-b border-line bg-white">
        <div className="grid min-h-12 grid-cols-[96px_minmax(0,1fr)]">
          <div className="flex items-start border-r border-line px-3 py-2 text-xs font-bold text-muted">{timeZoneOffsetLabel(timeZone)}</div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-2 py-2">
            {previewDateOnly ? (
              <span className="max-w-[260px] truncate rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-left text-xs font-bold text-muted shadow-sm">
                仮締切
              </span>
            ) : null}
            {dateOnlyEvents.length ? dateOnlyEvents.map((event, index) => {
              const label = `${dateOnlyMarker(event.status)} ${companyNameById.get(event.company_id) ?? "未設定"} | ${event.title || eventKindLabel(event.event_type)}`;

              return (
                <button
                  key={`${event.event_id}-${index}`}
                  type="button"
                  onClick={(clickEvent) => openCalendarEventPopover(event.event_id, clickEvent.currentTarget)}
                  className={`max-w-[260px] truncate rounded-md border px-2 py-1 text-left text-xs font-bold ${eventTypeTone(event.event_type)} ${selectedEventId === event.event_id ? "ring-2 ring-brand" : ""}`}
                  title={label}
                >
                  {label}
                </button>
              );
            }) : !previewDateOnly ? (
              <span className="text-xs font-semibold text-muted">締切・タスクなし</span>
            ) : null}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 overflow-auto">
        <div
          className="relative"
          style={{ height: gridHeight }}
          onPointerMove={(pointerEvent) => {
            if (draggingPreview) {
              pointerEvent.preventDefault();
              const rect = pointerEvent.currentTarget.getBoundingClientRect();
              const y = Math.max(0, Math.min(gridHeight, pointerEvent.clientY - rect.top));
              const next = nextDraggingPreviewState(draggingPreview, y, date, hourHeight);
              setDraggingPreview(next);
              emitPreviewChange(next.start, next.end);
              return;
            }
            if (!draggingEvent) return;
            pointerEvent.preventDefault();
            const rect = pointerEvent.currentTarget.getBoundingClientRect();
            const y = Math.max(0, Math.min(gridHeight, pointerEvent.clientY - rect.top));
            setDraggingEvent((current) => current ? nextDraggingEventState(current, y, date, hourHeight) : null);
          }}
          onPointerUp={() => {
            if (draggingPreview) {
              setDraggingPreview(null);
              return;
            }
            finishDrag();
          }}
          onPointerCancel={() => {
            setDraggingPreview(null);
            setDraggingEvent(null);
          }}
        >
          <button
            type="button"
            onClick={(clickEvent) => {
              const rect = clickEvent.currentTarget.getBoundingClientRect();
              const y = Math.max(0, Math.min(gridHeight, clickEvent.clientY - rect.top));
              const start = dateTimeForGridPosition(date, y, hourHeight);
              onAdd(start, addMinutesString(start, 60), "datetime");
            }}
            className="absolute inset-y-0 left-[96px] right-0 z-0 cursor-copy"
            aria-label="この日に予定を追加"
          />
          {hours.map((hour, index) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-t border-line"
              style={{ top: index * hourHeight }}
            >
              <span className="absolute left-3 -translate-y-1/2 text-xs font-bold text-muted">
                {String(hour).padStart(2, "0")}:00
              </span>
            </div>
          ))}
          {showNow ? (
            <div className="pointer-events-none absolute left-[96px] right-0 z-10 border-t border-red-500" style={{ top: nowTop }}>
              <span className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
            </div>
          ) : null}
          {renderPreviewStart && renderPreviewEnd && !previewDateOnly ? (
            <div
              onPointerDown={(pointerEvent) => {
                pointerEvent.stopPropagation();
                const rect = pointerEvent.currentTarget.getBoundingClientRect();
                const top = Math.max(0, (decimalHour(renderPreviewStart) - startHour) * hourHeight);
                const mode = pointerEvent.clientY - rect.top < 8
                  ? "resize-start"
                  : rect.bottom - pointerEvent.clientY < 8
                    ? "resize-end"
                    : "move";
                const pointerGridY = top + pointerEvent.clientY - rect.top;
                setDraggingPreview({
                  mode,
                  pointerStartY: pointerGridY,
                  dragStartY: top,
                  start: renderPreviewStart,
                  end: renderPreviewEnd,
                  durationMinutes: Math.max(5, Math.round((renderPreviewEnd.getTime() - renderPreviewStart.getTime()) / 60000))
                });
                pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
              }}
              className="absolute left-[96px] right-4 z-10 cursor-grab rounded-lg border border-dashed border-slate-300 bg-white/85 px-2 py-1 text-xs font-bold text-muted shadow-sm active:cursor-grabbing"
              style={{
                top: Math.max(0, (decimalHour(renderPreviewStart) - startHour) * hourHeight),
                height: Math.max(28, (decimalHour(renderPreviewEnd) - decimalHour(renderPreviewStart)) * hourHeight)
              }}
            >
              <span className="block truncate">仮予定</span>
              <span className="block truncate text-[11px] font-semibold">{rangeLabelFromDates(renderPreviewStart, renderPreviewEnd)}</span>
            </div>
          ) : null}
          {timedModels.map((model, index) => {
            const event = model.event;
            const activeDrag = draggingEvent?.event.event_id === event.event_id ? draggingEvent : null;
            const companyName = companyNameById.get(event.company_id) ?? "未設定";
            const title = event.title || eventKindLabel(event.event_type);
            const renderStart = activeDrag?.start ?? model.start;
            const renderEnd = activeDrag?.end ?? model.end;
            const top = Math.max(0, (decimalHour(renderStart) - startHour) * hourHeight);
            const height = Math.max(28, (decimalHour(renderEnd) - decimalHour(renderStart)) * hourHeight);
            const laneWidth = `((100% - 112px) / ${model.laneCount})`;

            return (
              <button
                key={`${event.event_id}-${index}`}
                type="button"
                onPointerDown={(pointerEvent) => {
                  pointerEvent.stopPropagation();
                  const rect = pointerEvent.currentTarget.getBoundingClientRect();
                  const mode = pointerEvent.clientY - rect.top < 8
                    ? "resize-start"
                    : rect.bottom - pointerEvent.clientY < 8
                      ? "resize-end"
                      : "move";
                  const pointerGridY = top + pointerEvent.clientY - rect.top;
                  setDraggingEvent({
                    event,
                    mode,
                    pointerStartY: pointerGridY,
                    dragStartY: top,
                    start: renderStart,
                    end: renderEnd,
                    originalStart: renderStart,
                    originalEnd: renderEnd,
                    durationMinutes: Math.max(5, Math.round((renderEnd.getTime() - renderStart.getTime()) / 60000))
                  });
                  pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
                }}
                onClick={(clickEvent) => {
                  if (draggingEvent) return;
                  openCalendarEventPopover(event.event_id, clickEvent.currentTarget);
                }}
                className={`absolute z-20 overflow-hidden rounded-lg border px-2 py-1 text-left text-xs font-bold shadow-sm ${eventTypeTone(event.event_type)} ${activeDrag || selectedEventId === event.event_id ? "ring-2 ring-brand ring-offset-1" : ""}`}
                style={{
                  top,
                  height,
                  left: `calc(96px + ${model.lane} * ${laneWidth})`,
                  width: `calc(${laneWidth} - 6px)`
                }}
                title={`${companyName} | ${title} ${eventScheduleRangeLabel(event, timeZone)}`}
              >
                <span className="block truncate">{companyName} | {title}</span>
                <span className="block truncate text-[11px] font-semibold opacity-80">{rangeLabelFromDates(renderStart, renderEnd)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function dateOnlyMarker(status: string) {
  return status.includes("予定") ? "○" : "✓";
}

function calendarEventDotClass(eventType: string) {
  const tone = eventTypeTone(eventType);
  if (tone.includes("sky")) return "bg-sky-500";
  if (tone.includes("emerald")) return "bg-emerald-500";
  if (tone.includes("violet")) return "bg-violet-500";
  if (tone.includes("amber")) return "bg-amber-500";
  return "bg-slate-500";
}

function buildDayEventModels(events: SheetRow<JobEvent>[], timeZone: string) {
  const models = events
    .map((event) => {
      const start = eventDate(event, timeZone);
      if (!start) return null;
      return {
        event,
        start,
        end: eventEndDate(event, start)
      };
    })
    .filter((model): model is { event: SheetRow<JobEvent>; start: Date; end: Date } => Boolean(model))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const laneEnds: number[] = [];
  const placed = models.map((model) => {
    const lane = laneEnds.findIndex((end) => model.start.getTime() >= end);
    const nextLane = lane === -1 ? laneEnds.length : lane;
    laneEnds[nextLane] = model.end.getTime();

    return {
      ...model,
      lane: nextLane
    };
  });
  const laneCount = Math.max(1, laneEnds.length);

  return placed.map((model) => ({
    ...model,
    laneCount
  }));
}

type DraggingEventState = {
  event: SheetRow<JobEvent>;
  mode: "move" | "resize-start" | "resize-end";
  pointerStartY: number;
  dragStartY: number;
  start: Date;
  end: Date;
  originalStart: Date;
  originalEnd: Date;
  durationMinutes: number;
};

type DraggingPreviewState = {
  mode: "move" | "resize-start" | "resize-end";
  pointerStartY: number;
  dragStartY: number;
  start: Date;
  end: Date;
  durationMinutes: number;
};

function nextDraggingPreviewState(current: DraggingPreviewState, y: number, date: Date, hourHeight: number): DraggingPreviewState {
  if (current.mode === "move") {
    const top = Math.max(0, Math.min(23 * hourHeight, current.dragStartY + (y - current.pointerStartY)));
    const start = dateTimeForGridDate(date, top, hourHeight);
    return {
      ...current,
      start,
      end: addMinutesDate(start, current.durationMinutes)
    };
  }

  if (current.mode === "resize-start") {
    const start = dateTimeForGridDate(date, y, hourHeight);
    const latestStart = addMinutesDate(current.end, -5);
    return {
      ...current,
      start: start.getTime() < latestStart.getTime() ? start : latestStart
    };
  }

  const end = dateTimeForGridDate(date, y, hourHeight);
  const earliestEnd = addMinutesDate(current.start, 5);
  return {
    ...current,
    end: end.getTime() > earliestEnd.getTime() ? end : earliestEnd
  };
}

function nextDraggingEventState(current: DraggingEventState, y: number, date: Date, hourHeight: number): DraggingEventState {
  if (current.mode === "move") {
    const top = Math.max(0, Math.min(23 * hourHeight, current.dragStartY + (y - current.pointerStartY)));
    const start = dateTimeForGridDate(date, top, hourHeight);
    return {
      ...current,
      start,
      end: addMinutesDate(start, current.durationMinutes)
    };
  }

  if (current.mode === "resize-start") {
    const start = dateTimeForGridDate(date, y, hourHeight);
    const latestStart = addMinutesDate(current.end, -5);
    return {
      ...current,
      start: start.getTime() < latestStart.getTime() ? start : latestStart
    };
  }

  const end = dateTimeForGridDate(date, y, hourHeight);
  const earliestEnd = addMinutesDate(current.start, 5);
  return {
    ...current,
    end: end.getTime() > earliestEnd.getTime() ? end : earliestEnd
  };
}

function eventEndDate(event: SheetRow<JobEvent>, start: Date) {
  const rawEnd = parseDateTimeValue(event.end_datetime);
  const end = rawEnd && rawEnd.getTime() > start.getTime()
    ? rawEnd
    : new Date(start.getTime() + 60 * 60 * 1000);

  return end;
}

function parseDateTimeValue(value?: string) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function decimalHour(value: Date) {
  return value.getHours() + value.getMinutes() / 60;
}

function dateTimeForGridPosition(date: Date, y: number, hourHeight: number) {
  const minutes = Math.max(0, Math.min(23 * 60 + 55, Math.round((y / hourHeight) * 12) * 5));
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  return `${dateKey(date)} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function dateTimeForGridDate(date: Date, y: number, hourHeight: number) {
  return parseDateTimeValue(dateTimeForGridPosition(date, y, hourHeight)) ?? startOfDay(date);
}

function addMinutesDate(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60 * 1000);
}

function addMinutesString(value: string, minutes: number) {
  const date = parseDateTimeValue(value);
  if (!date) return value;
  date.setMinutes(date.getMinutes() + minutes);

  return `${dateKey(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateTimeValue(date: Date) {
  return `${dateKey(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function rangeLabelFromDates(start: Date, end: Date) {
  return `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}〜${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
}

function eventToLocalUpdate(event: SheetRow<JobEvent>, start: Date, end: Date, timeZone: string): LocalEventUpdateDraft {
  return {
    draft_id: event.event_id,
    event_id: event.event_id,
    company_id: event.company_id,
    selection_type: event.selection_type,
    event_type: event.event_type,
    title: event.title,
    start_datetime: formatDateTimeValue(start),
    end_datetime: formatDateTimeValue(end),
    timezone: event.timezone || timeZone,
    is_period: event.is_period,
    period_end_date: event.period_end_date,
    event_series_id: event.event_series_id,
    series_day_index: event.series_day_index,
    time_mode: "datetime",
    status: event.status,
    person: event.person,
    meeting_url: event.meeting_url,
    memo: event.memo,
    sync_to_calendar: event.sync_to_calendar,
    created_at: event.created_at || new Date().toISOString()
  };
}

function openCalendarEventPopover(eventId: string, target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  window.dispatchEvent(new CustomEvent("job-hunt-note:timeline-event-open", {
    detail: {
      eventId,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height
    }
  }));
}

function formatDayTitle(date: Date) {
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${date.getFullYear()}年 ${date.getMonth() + 1}月 ${date.getDate()}日（${weekdays[date.getDay()]}）`;
}

function timeZoneOffsetLabel(value: string) {
  return timeZoneLabel(value).split(" ")[0] ?? value;
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
    grouped.set(key, sortEventsBySchedule(list, timeZone).sort((a, b) => Number(!isDateOnlyEvent(a)) - Number(!isDateOnlyEvent(b))));
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
    event_series_id: draft.event_series_id,
    series_day_index: draft.series_day_index,
    time_mode: draft.time_mode,
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
  const updateMap = new Map(updates.filter((update) => !update.synced_at).map((update) => [update.event_id, update]));

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
        event_series_id: update.event_series_id,
        series_day_index: update.series_day_index,
        time_mode: update.time_mode,
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
  const updateMap = new Map(updates.filter((update) => !update.synced_at).map((update) => [update.company_id, update]));

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
