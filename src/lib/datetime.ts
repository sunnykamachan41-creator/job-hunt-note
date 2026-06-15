import { defaultDurationEventTypes } from "@/types/event";

export const timeZone = "Asia/Tokyo";

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

  const normalizedStart = start.includes("T") ? start : start.replace(" ", "T");
  const startedAt = new Date(normalizedStart);

  if (Number.isNaN(startedAt.getTime())) {
    return "";
  }

  const endedAt = new Date(startedAt.getTime() + 60 * 60 * 1000);
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
