"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DaySchedule = {
  date: string;
  startTime: string;
  endTime: string;
};

export function PeriodEventFields({
  startDatetime,
  endDatetime,
  initialEnabled = false,
  initialEndDate,
  initialSchedules = [],
  minEndDate,
  syncEndDateWithEndDatetime = false
}: {
  startDatetime: string;
  endDatetime: string;
  initialEnabled?: boolean;
  initialEndDate?: string;
  initialSchedules?: DaySchedule[];
  minEndDate?: string;
  syncEndDateWithEndDatetime?: boolean;
}) {
  const startDate = datePart(startDatetime) || todayDate();
  const defaultStartTime = normalizeFiveMinuteTime(timePart(startDatetime) || "09:00");
  const defaultEndTime = normalizeFiveMinuteTime(timePart(endDatetime) || addHour(defaultStartTime));
  const [enabled, setEnabled] = useState(initialEnabled);
  const [endDate, setEndDate] = useState(initialEndDate || startDate);
  const [scheduleMode, setScheduleMode] = useState<"range" | "dates">(() => hasDateGap(initialSchedules) ? "dates" : "range");
  const [selectedDates, setSelectedDates] = useState(() => uniqueDates(initialSchedules.map((schedule) => schedule.date).filter(Boolean).length ? initialSchedules.map((schedule) => schedule.date) : [startDate]));
  const [dateToAdd, setDateToAdd] = useState(startDate);
  const [expanded, setExpanded] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, DaySchedule>>(() => Object.fromEntries(initialSchedules.map((schedule) => [schedule.date, schedule])));
  const previousStartDate = useRef(startDate);
  const rangeDates = useMemo(() => dateRange(startDate, endDate), [endDate, startDate]);
  const dates = scheduleMode === "range" ? rangeDates : selectedDates;

  useEffect(() => {
    const earliestEnd = [startDate, minEndDate].filter(Boolean).sort().at(-1) ?? startDate;
    setEndDate((current) => current < earliestEnd ? earliestEnd : current);
  }, [minEndDate, startDate]);

  useEffect(() => {
    const previous = previousStartDate.current;
    previousStartDate.current = startDate;

    if (previous && previous !== startDate && scheduleMode === "range") {
      const movedEndDate = addDays(endDate, dayDiff(previous, startDate));
      setEndDate(movedEndDate < startDate ? startDate : movedEndDate);
    }

    setDateToAdd((current) => current < startDate ? startDate : current);
    setSelectedDates((current) => uniqueDates([startDate, ...current.filter((date) => date >= startDate)]));
  }, [endDate, scheduleMode, startDate]);

  useEffect(() => {
    if (!syncEndDateWithEndDatetime) return;
    const nextEndDate = datePart(endDatetime);
    if (nextEndDate) {
      setEndDate(nextEndDate < startDate ? startDate : nextEndDate);
    }
  }, [endDatetime, startDate, syncEndDateWithEndDatetime]);

  const schedules = dates.map((date) => overrides[date] ?? {
    date,
    startTime: defaultStartTime,
    endTime: defaultEndTime
  });

  function updateSchedule(date: string, patch: Partial<DaySchedule>) {
    setOverrides((current) => ({
      ...current,
      [date]: {
        ...(current[date] ?? { date, startTime: defaultStartTime, endTime: defaultEndTime }),
        ...patch
      }
    }));
  }

  function updateStartTime(date: string, value: string) {
    const startTime = normalizeFiveMinuteTime(value);
    updateSchedule(date, {
      startTime,
      endTime: addHour(startTime)
    });
  }

  function updateEndTime(date: string, value: string) {
    updateSchedule(date, {
      endTime: normalizeFiveMinuteTime(value)
    });
  }

  function switchScheduleMode(mode: "range" | "dates") {
    if (mode === "dates") {
      setSelectedDates((current) => uniqueDates([startDate, ...current.filter((date) => date >= startDate)]));
      setDateToAdd(startDate);
    } else {
      const lastDate = selectedDates.at(-1) ?? startDate;
      setEndDate(lastDate < startDate ? startDate : lastDate);
    }
    setScheduleMode(mode);
  }

  function addDate() {
    if (!dateToAdd || dateToAdd < startDate) return;
    setSelectedDates((current) => uniqueDates([...current, dateToAdd]));
  }

  function removeDate(date: string) {
    if (date === startDate) return;
    setSelectedDates((current) => uniqueDates(current.filter((item) => item !== date)));
  }

  return (
    <div className="grid gap-3 rounded-xl border border-line bg-slate-50 p-4">
      <input type="hidden" name="is_period" value={enabled ? "true" : "false"} />
      <input type="hidden" name="period_end_date" value={enabled ? endDate : ""} />
      <input type="hidden" name="period_days_json" value={enabled ? JSON.stringify(schedules) : ""} />
      <label className="flex items-center justify-between gap-3 text-sm font-semibold text-ink">
        <span>複数日イベント</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="h-4 w-4 accent-brand"
        />
      </label>
      {enabled ? (
        <>
          <div className="grid grid-cols-2 rounded-lg border border-line bg-white p-1 text-xs font-bold">
            <button type="button" onClick={() => switchScheduleMode("range")} className={`h-8 rounded-md ${scheduleMode === "range" ? "bg-blue-50 text-brand" : "text-muted hover:bg-slate-50"}`}>連続日程</button>
            <button type="button" onClick={() => switchScheduleMode("dates")} className={`h-8 rounded-md ${scheduleMode === "dates" ? "bg-blue-50 text-brand" : "text-muted hover:bg-slate-50"}`}>個別日程</button>
          </div>
          {scheduleMode === "range" ? (
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-semibold text-muted">終了日</span>
              <input
                type="date"
                min={minEndDate || startDate}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value || startDate)}
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink"
              />
            </label>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input
                type="date"
                min={startDate}
                value={dateToAdd}
                onChange={(event) => setDateToAdd(event.target.value)}
                className="h-10 min-w-0 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink"
              />
              <button type="button" onClick={addDate} className="h-10 rounded-lg border border-line bg-white px-3 text-sm font-bold text-ink hover:bg-slate-50">日程を追加</button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 text-xs text-muted">
            <span>{dates.length}日分の予定を作成します</span>
            <button type="button" onClick={() => setExpanded((current) => !current)} className="font-bold text-brand hover:underline">
              {expanded ? "日別時刻を閉じる" : "日別に時刻を編集"}
            </button>
          </div>
          {expanded ? (
            <div className="grid max-h-64 gap-2 overflow-y-auto border-t border-line pt-3">
              {schedules.map((schedule, index) => (
                <div key={schedule.date} className="grid grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                  <span className="font-bold text-ink">{formatDate(schedule.date)} | Day {index + 1}</span>
                  <input
                    type="time"
                    step="300"
                    value={schedule.startTime}
                    onChange={(event) => updateStartTime(schedule.date, event.target.value)}
                    className="h-9 rounded-lg border border-line bg-white px-2 text-sm font-semibold text-ink"
                    aria-label={`${schedule.date} start time`}
                  />
                  <input
                    type="time"
                    step="300"
                    value={schedule.endTime}
                    onChange={(event) => updateEndTime(schedule.date, event.target.value)}
                    className="h-9 rounded-lg border border-line bg-white px-2 text-sm font-semibold text-ink"
                    aria-label={`${schedule.date} end time`}
                  />
                  {scheduleMode === "dates" && schedule.date !== startDate ? (
                    <button
                      type="button"
                      onClick={() => removeDate(schedule.date)}
                      className="h-9 rounded-lg px-2 text-xs font-bold text-red-600 hover:bg-red-50"
                    >
                      削除
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function uniqueDates(values: string[]) {
  return [...new Set(values.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)))].sort();
}

function hasDateGap(schedules: DaySchedule[]) {
  const dates = uniqueDates(schedules.map((schedule) => schedule.date));
  if (dates.length < 2) return false;
  return dateRange(dates[0], dates.at(-1) ?? dates[0]).some((date) => !dates.includes(date));
}

function datePart(value: string) {
  const matched = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return matched?.[1] ?? "";
}

function timePart(value: string) {
  const matched = value.match(/[T\s](\d{2}:\d{2})$/);
  return matched?.[1] ?? "";
}

function dateRange(start: string, end: string) {
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return [start];

  const dates: string[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate && dates.length < 31) {
    dates.push(formatDateKey(cursor));
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

function dayDiff(from: string, to: string) {
  const fromDate = parseLocalDate(from);
  const toDate = parseLocalDate(to);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
}

function addDays(value: string, amount: number) {
  const date = parseLocalDate(value);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + amount);
  return formatDateKey(date);
}

function addHour(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const total = ((hours * 60 + minutes + 60) % (24 * 60));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function normalizeFiveMinuteTime(value: string) {
  const matched = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!matched) return "09:00";
  const hours = Math.min(23, Math.max(0, Number(matched[1])));
  const minutes = Math.min(59, Math.max(0, Number(matched[2])));
  const roundedMinutes = Math.round(minutes / 5) * 5;
  const total = hours * 60 + roundedMinutes;
  const normalizedHours = Math.floor((total % (24 * 60)) / 60);
  const normalizedMinutes = total % 60;
  return `${String(normalizedHours).padStart(2, "0")}:${String(normalizedMinutes).padStart(2, "0")}`;
}

function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}
