"use client";

import { useEffect, useMemo, useState } from "react";

const fallbackTimeZones = [
  "Asia/Tokyo",
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Paris",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney"
];

const timeZoneHistoryKey = "job-hunt-note.timeZoneHistory";
const hourOptions = Array.from({ length: 24 }, (_, index) => pad(index));
const minuteOptions = Array.from({ length: 12 }, (_, index) => pad(index * 5));

export function EventDatetimeFields({
  startDatetime,
  endDatetime,
  timeZone = "Asia/Tokyo",
  timeMode,
  onDatetimeChange
}: {
  startDatetime?: string;
  endDatetime?: string;
  timeZone?: string;
  timeMode?: string;
  onDatetimeChange?: (value: { startDatetime: string; endDatetime: string }) => void;
}) {
  const initialStart = useMemo(() => parseDateTimeParts(startDatetime) ?? defaultStartParts(), [startDatetime]);
  const initialEnd = useMemo(
    () => parseDateTimeParts(endDatetime) ?? addMinutesToParts(initialStart, 60),
    [endDatetime, initialStart]
  );
  const initialDurationMinutes = useMemo(
    () => durationMinutes(initialStart, initialEnd),
    [initialEnd, initialStart]
  );
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [endTouched, setEndTouched] = useState(false);
  const [hasTime, setHasTime] = useState(initialHasTime(startDatetime, endDatetime, timeMode));

  useEffect(() => {
    setStart(initialStart);
    setEnd(initialEnd);
    setEndTouched(false);
    setHasTime(initialHasTime(startDatetime, endDatetime, timeMode));
  }, [endDatetime, initialEnd, initialStart, startDatetime, timeMode]);

  const startValue = hasTime ? `${start.date} ${start.time}` : `${start.date} 00:00`;
  const endValue = hasTime ? `${end.date} ${end.time}` : "";

  useEffect(() => {
    onDatetimeChange?.({ startDatetime: startValue, endDatetime: endValue });
  }, [endValue, onDatetimeChange, startValue]);

  return (
    <div className="grid gap-4 rounded-xl border border-line bg-slate-50 p-4">
      <input type="hidden" name="start_datetime" value={startValue} />
      <input type="hidden" name="end_datetime" value={endValue} />
      <input type="hidden" name="time_mode" value={hasTime ? "datetime" : "date_only"} />
      <div className="grid min-w-0 gap-3">
        <div className="grid min-w-0 grid-cols-[minmax(11rem,1fr)_8.75rem] gap-3">
          <input
            type="date"
            value={start.date}
            onChange={(event) => {
              const currentDurationMinutes = durationMinutes(start, end);
              const next = { ...start, date: event.target.value };
              setStart(next);
              setEnd(addMinutesToParts(next, currentDurationMinutes));
            }}
            className="h-11 min-w-0 rounded-lg border-0 bg-white px-3 text-sm font-semibold text-ink shadow-sm"
          />
          <TimeSelect
            value={start.time}
            disabled={!hasTime}
            onChange={(event) => {
              const next = { ...start, time: event };
              setStart(next);
              if (!endTouched) {
                setEnd(addMinutesToParts(next, initialDurationMinutes));
              }
            }}
            className="h-11 min-w-0 rounded-lg border-0 bg-white px-3 text-sm font-semibold text-ink shadow-sm disabled:text-subtle"
          />
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(11rem,1fr)_8.75rem] gap-3">
          <input
            type="date"
            value={end.date}
            disabled={!hasTime}
            onChange={(event) => {
              setEndTouched(true);
              setEnd({ ...end, date: event.target.value });
            }}
            className="h-11 min-w-0 rounded-lg border-0 bg-white px-3 text-sm font-semibold text-ink shadow-sm disabled:text-subtle"
          />
          <TimeSelect
            value={end.time}
            disabled={!hasTime}
            onChange={(event) => {
              setEndTouched(true);
              setEnd({ ...end, time: event });
            }}
            className="h-11 min-w-0 rounded-lg border-0 bg-white px-3 text-sm font-semibold text-ink shadow-sm disabled:text-subtle"
          />
        </div>
      </div>
      <div className="grid min-w-0 gap-2 text-sm">
        <label className="inline-flex items-center gap-2 text-[0px] font-semibold text-ink">
          <input
            type="checkbox"
            checked={hasTime}
            onChange={(event) => setHasTime(event.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          <span className="text-sm">時刻を指定する</span>
          終日
        </label>
        <TimeZoneSelect
          name="timezone"
          className="h-11 min-w-0 rounded-lg border-0 bg-white px-3 text-sm font-semibold text-ink shadow-sm"
          defaultValue={timeZone}
        />
      </div>
    </div>
  );
}

function initialHasTime(startDatetime?: string, endDatetime?: string, timeMode?: string) {
  if (timeMode === "date_only") return false;
  if (timeMode === "datetime") return true;
  return !(Boolean(startDatetime) && /(?:T|\s)00:00$/.test(startDatetime ?? "") && !endDatetime);
}

function TimeSelect({
  value,
  disabled,
  onChange,
  className
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [hour, minute] = splitTime(value);

  return (
    <span className={`grid grid-cols-[minmax(2.75rem,1fr)_auto_minmax(2.75rem,1fr)] items-center gap-2 ${className ?? ""}`}>
      <select
        value={hour}
        disabled={disabled}
        onChange={(event) => onChange(`${event.target.value}:${minute}`)}
        className="h-full min-w-0 appearance-none bg-transparent text-center outline-none disabled:text-subtle"
        aria-label="時"
      >
        {hourOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="text-muted">:</span>
      <select
        value={minute}
        disabled={disabled}
        onChange={(event) => onChange(`${hour}:${event.target.value}`)}
        className="h-full min-w-0 appearance-none bg-transparent text-center outline-none disabled:text-subtle"
        aria-label="分"
      >
        {minuteOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </span>
  );
}

export function TimeZoneSelect({
  name,
  defaultValue = "Asia/Tokyo",
  className = ""
}: {
  name: string;
  defaultValue?: string;
  className?: string;
}) {
  const [selectedTimeZone, setSelectedTimeZone] = useState(defaultValue);
  const [timeZoneHistory, setTimeZoneHistory] = useState<string[]>([]);

  useEffect(() => {
    setTimeZoneHistory(readTimeZoneHistory());
  }, []);

  const timeZoneOptions = useMemo(() => prioritizedTimeZones(selectedTimeZone, timeZoneHistory), [selectedTimeZone, timeZoneHistory]);

  return (
    <select
      name={name}
      className={className}
      value={selectedTimeZone}
      onChange={(event) => {
        const nextTimeZone = event.target.value;
        setSelectedTimeZone(nextTimeZone);
        saveTimeZoneHistory(nextTimeZone);
        setTimeZoneHistory(readTimeZoneHistory());
      }}
    >
      {timeZoneOptions.map((option) => (
        <option key={option} value={option}>
          {timeZoneLabel(option)}
        </option>
      ))}
    </select>
  );
}

export function defaultStartDatetimeLocal() {
  return `${partsToDatetime(defaultStartParts()).replace(" ", "T")}`;
}

export function addMinutesLocal(value: string, minutes: number) {
  const parts = parseDateTimeParts(value);
  if (!parts) return value;
  return partsToDatetime(addMinutesToParts(parts, minutes)).replace(" ", "T");
}

function parseDateTimeParts(value?: string) {
  if (!value) return null;
  const matched = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/);
  if (!matched) return null;
  const [, year, month, day, hour = "9", minute = "00"] = matched;
  return {
    date: `${year}-${pad(Number(month))}-${pad(Number(day))}`,
    time: `${pad(Number(hour))}:${minute}`
  };
}

function defaultStartParts() {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setHours(9, 0, 0, 0);

  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  };
}

function addMinutesToParts(parts: { date: string; time: string }, minutes: number) {
  const date = new Date(`${parts.date}T${parts.time}`);
  if (Number.isNaN(date.getTime())) return parts;
  date.setMinutes(date.getMinutes() + minutes);

  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  };
}

function durationMinutes(start: { date: string; time: string }, end: { date: string; time: string }) {
  const startDate = new Date(`${start.date}T${start.time}`);
  const endDate = new Date(`${end.date}T${end.time}`);
  const difference = endDate.getTime() - startDate.getTime();

  return Number.isFinite(difference) && difference > 0 ? Math.round(difference / 60_000) : 60;
}

function partsToDatetime(parts: { date: string; time: string }) {
  return `${parts.date} ${parts.time}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeTimeOption(value: string) {
  const [hour = "0", minute = "0"] = value.split(":");
  return `${normalizeHour(hour)}:${normalizeMinute(minute)}`;
}

function splitTime(value: string) {
  return normalizeTimeOption(value).split(":") as [string, string];
}

function normalizeHour(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "00";
  return pad(Math.min(23, Number(digits)));
}

function normalizeMinute(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "00";
  const rounded = Math.round(Math.min(59, Number(digits)) / 5) * 5;
  return pad(Math.min(55, rounded));
}

function prioritizedTimeZones(selectedTimeZone: string, history: string[]) {
  const supported = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : fallbackTimeZones;
  const preferred = [selectedTimeZone, ...history, "Asia/Tokyo", "UTC"];
  const preferredSet = new Set(preferred.filter(Boolean));
  const preferredItems = unique(preferred).sort(compareTimeZones);
  const remainingItems = supported
    .filter((timeZone) => !preferredSet.has(timeZone))
    .sort(compareTimeZones);

  return [...preferredItems, ...remainingItems];
}

function readTimeZoneHistory() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(timeZoneHistoryKey) ?? "[]");
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed)
        .filter((entry): entry is [string, number] => typeof entry[0] === "string" && typeof entry[1] === "number")
        .sort((a, b) => b[1] - a[1] || compareTimeZones(a[0], b[0]))
        .map(([timeZone]) => timeZone);
    }
    return [];
  } catch {
    return [];
  }
}

function saveTimeZoneHistory(value: string) {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(timeZoneHistoryKey);
  let counts: Record<string, number> = {};

  try {
    const parsed = JSON.parse(raw ?? "{}");
    if (Array.isArray(parsed)) {
      counts = Object.fromEntries(parsed.filter((item) => typeof item === "string").map((item) => [item, 1]));
    } else if (parsed && typeof parsed === "object") {
      counts = Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number")
      );
    }
  } catch {
    counts = {};
  }

  counts[value] = (counts[value] ?? 0) + 1;
  window.localStorage.setItem(timeZoneHistoryKey, JSON.stringify(counts));
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function timeZoneLabel(value: string) {
  const offset = timeZoneOffsetLabel(value);
  return offset ? `(GMT${offset}) ${value}` : value;
}

function compareTimeZones(a: string, b: string) {
  const offsetDiff = timeZoneOffsetMinutes(a) - timeZoneOffsetMinutes(b);
  if (offsetDiff !== 0) return offsetDiff;
  return a.localeCompare(b, "en");
}

function timeZoneOffsetLabel(timeZone: string) {
  const minutes = timeZoneOffsetMinutes(timeZone);
  if (!Number.isFinite(minutes)) return "";
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const mins = absolute % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function timeZoneOffsetMinutes(timeZone: string) {
  try {
    const date = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset"
    }).formatToParts(date);
    const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
    const matched = offset.match(/^GMT(?:(\+|-)(\d{1,2})(?::?(\d{2}))?)?$/);

    if (!matched) return 0;

    const [, sign = "+", hours = "0", minutes = "0"] = matched;
    const value = Number(hours) * 60 + Number(minutes);
    return sign === "-" ? -value : value;
  } catch {
    return 0;
  }
}
