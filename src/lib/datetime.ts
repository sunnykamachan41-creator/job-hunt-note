import { defaultDurationEventTypes } from "@/types/event";

export const defaultTimeZone = "Asia/Tokyo";
export const timeZone = defaultTimeZone;

export function nowInTokyo() {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  return formatter.format(new Date()).replace("T", " ");
}

export function completeEventEndDatetime(eventType: string, start: string, end: string) {
  if (end || !start) {
    return end;
  }

  if (!defaultDurationEventTypes.some((type) => eventType.includes(type))) {
    return "";
  }

  const parts = parseDateTimeParts(start);

  if (!parts) {
    return "";
  }

  const endedAt = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  endedAt.setHours(endedAt.getHours() + 1);
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    endedAt.getFullYear(),
    pad(endedAt.getMonth() + 1),
    pad(endedAt.getDate())
  ].join("-") + ` ${pad(endedAt.getHours())}:${pad(endedAt.getMinutes())}`;
}

export function normalizeDatetime(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace("T", " ").trim();
}

export function zonedDateTimeToInstant(value: string, zone = defaultTimeZone) {
  const parts = parseDateTimeParts(value);
  if (!parts) return null;

  let utc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  for (let index = 0; index < 2; index += 1) {
    utc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - timeZoneOffsetMs(zone, new Date(utc));
  }

  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function instantToZonedDate(instant: Date, zone = defaultTimeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const date = new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return Number.isNaN(date.getTime()) ? instant : date;
}

export function convertZonedDateTime(value: string, fromZone = defaultTimeZone, toZone = defaultTimeZone) {
  const instant = zonedDateTimeToInstant(value, fromZone);
  return instant ? instantToZonedDate(instant, toZone) : null;
}

function parseDateTimeParts(value: string) {
  if (!value) return null;
  const matched = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!matched) return null;
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = matched;

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second)
  };
}

function timeZoneOffsetMs(zone: string, date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - date.getTime();
}
