import type { SheetRow } from "@/lib/google-sheets";
import { convertZonedDateTime, defaultTimeZone } from "@/lib/datetime";
import { parseBoolean } from "@/lib/records";
import type { Company } from "@/types/company";
import type { JobEvent } from "@/types/event";

export type EventBucketKey =
  | "overdue"
  | "today"
  | "tomorrow"
  | "thisWeek"
  | "nextWeek"
  | "later"
  | "unscheduled";

export type EventBucket = {
  key: EventBucketKey;
  label: string;
  description: string;
  events: SheetRow<JobEvent>[];
};

const bucketMeta: Record<EventBucketKey, { label: string; description: string }> = {
  overdue: { label: "期限切れ", description: "確認が必要な過去日付の予定" },
  today: { label: "今日", description: "今日やること" },
  tomorrow: { label: "明日", description: "明日までに準備すること" },
  thisWeek: { label: "今週", description: "今週中の予定" },
  nextWeek: { label: "来週", description: "来週の予定" },
  later: { label: "それ以降", description: "少し先の予定" },
  unscheduled: { label: "日付未設定", description: "日付を入れると優先順位に並びます" }
};

const bucketOrder: EventBucketKey[] = [
  "overdue",
  "today",
  "tomorrow",
  "thisWeek",
  "nextWeek",
  "later",
  "unscheduled"
];

const inactiveStatuses = new Set(["落選", "辞退", "内定"]);

export function groupEventsByPeriod(events: SheetRow<JobEvent>[], now = new Date(), displayTimeZone = defaultTimeZone): EventBucket[] {
  const activeEvents = events.filter((event) => !isHiddenEvent(event));
  const buckets = new Map<EventBucketKey, SheetRow<JobEvent>[]>(
    bucketOrder.map((key) => [key, []])
  );

  for (const event of sortEventsBySchedule(activeEvents, displayTimeZone)) {
    buckets.get(getEventBucketKey(event, now, displayTimeZone))?.push(event);
  }

  return bucketOrder.map((key) => ({
    key,
    ...bucketMeta[key],
    events: buckets.get(key) ?? []
  }));
}

export function sortEventsBySchedule(events: SheetRow<JobEvent>[], displayTimeZone = defaultTimeZone) {
  return [...events].sort((a, b) => {
    const aTime = eventDate(a, displayTimeZone)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bTime = eventDate(b, displayTimeZone)?.getTime() ?? Number.POSITIVE_INFINITY;

    if (aTime !== bTime) {
      return aTime - bTime;
    }

    return a.event_type.localeCompare(b.event_type, "ja");
  });
}

export function sortCompaniesForTimeline(
  companies: SheetRow<Company>[],
  events: SheetRow<JobEvent>[],
  now = new Date()
) {
  const today = startOfDay(now).getTime();
  const eventsByCompany = new Map<string, SheetRow<JobEvent>[]>();

  for (const event of events) {
    const list = eventsByCompany.get(event.company_id) ?? [];
    list.push(event);
    eventsByCompany.set(event.company_id, list);
  }

  return [...companies].sort((a, b) => {
    const aScore = timelineCompanyScore(a, eventsByCompany.get(a.company_id) ?? [], today);
    const bScore = timelineCompanyScore(b, eventsByCompany.get(b.company_id) ?? [], today);

    if (aScore.group !== bScore.group) {
      return aScore.group - bScore.group;
    }

    if (aScore.primary !== bScore.primary) {
      return aScore.primary - bScore.primary;
    }

    return a.company_name.localeCompare(b.company_name, "ja");
  });
}

export function nextEventForCompany(company: Company, events: SheetRow<JobEvent>[], now = new Date()) {
  return sortEventsBySchedule(events)
    .filter((event) => event.company_id === company.company_id)
    .filter((event) => !isInactiveStatus(event.status))
    .find((event) => {
      const date = eventDate(event);
      return !date || startOfDay(date).getTime() >= startOfDay(now).getTime();
    });
}

export function nextActionLabel(company: Company, events: SheetRow<JobEvent>[], now = new Date()) {
  if (isInactiveStatus(company.status)) {
    return `次：${company.status}`;
  }

  const event = nextEventForCompany(company, events, now);

  if (!event) {
    return "次：未設定";
  }

  const date = eventDate(event);
  const type = eventKindLabel(event.event_type);

  if (!date) {
    return `次：日付未設定 ${type}`;
  }

  if (isDeadlineEvent(event.event_type)) {
    return `次：${type}締切まで${relativeDayLabel(date, now)}`;
  }

  return `次：${formatMonthDay(date)} ${type}`;
}

export function eventScheduleLabel(event: JobEvent, displayTimeZone = event.timezone || defaultTimeZone) {
  const date = eventDate(event, displayTimeZone);

  if (!date) {
    return "日付未設定";
  }

  const time = formatTime(date);

  if (parseBoolean(event.is_period) && event.period_end_date) {
    return `${formatMonthDay(date)} - ${formatMonthDay(parseDate(event.period_end_date) ?? date)}`;
  }

  if (isDateOnlyEvent(event)) {
    return formatMonthDay(date);
  }

  return time ? `${formatMonthDay(date)} ${time}` : formatMonthDay(date);
}

export function eventScheduleRangeLabel(event: JobEvent, displayTimeZone = event.timezone || defaultTimeZone) {
  const start = eventDate(event, displayTimeZone);

  if (!start) {
    return eventScheduleLabel(event, displayTimeZone);
  }

  if (parseBoolean(event.is_period) && event.period_end_date) {
    return eventScheduleLabel(event, displayTimeZone);
  }

  if (isDateOnlyEvent(event)) {
    return eventScheduleLabel(event, displayTimeZone);
  }

  const end = event.end_datetime
    ? convertZonedDateTime(event.end_datetime, event.timezone || defaultTimeZone, displayTimeZone)
      ?? parseDateTime(event.end_datetime)
    : null;

  if (!end) {
    return eventScheduleLabel(event, displayTimeZone);
  }

  const startTime = formatTime(start);
  const endTime = formatTime(end);

  if (start.toDateString() === end.toDateString()) {
    return startTime ? `${formatMonthDay(start)} ${startTime}-${endTime}` : formatMonthDay(start);
  }

  return `${formatMonthDay(start)} ${startTime || "終日"} - ${formatMonthDay(end)} ${endTime || "終日"}`;
}

export function eventTimeLabel(event: JobEvent, displayTimeZone = event.timezone || defaultTimeZone) {
  const date = eventDate(event, displayTimeZone);

  if (!date) {
    return "未設定";
  }

  return formatTime(date) || "終日";
}

export function isDateOnlyEvent(event: JobEvent) {
  if (event.time_mode === "date_only") return true;
  if (event.time_mode === "datetime") return false;
  return /(?:T|\s)00:00$/.test(event.start_datetime) && !event.end_datetime;
}

export function relativeDayLabel(date: Date, now = new Date()) {
  const diff = dayDiff(startOfDay(now), startOfDay(date));

  if (diff < 0) {
    return `${Math.abs(diff)}日経過`;
  }

  if (diff === 0) {
    return "今日";
  }

  if (diff === 1) {
    return "明日";
  }

  return `あと${diff}日`;
}

export function statusTone(status: string) {
  if (status === "予定" || status === "選考中") return "bg-blue-100 text-blue-700";
  if (status === "検討中") return "bg-slate-100 text-slate-700";
  if (status === "結果待ち") return "bg-yellow-100 text-yellow-700";
  if (status === "通過") return "bg-green-100 text-green-700";
  if (status === "落選") return "bg-red-100 text-red-600";
  if (status === "辞退") return "bg-amber-100 text-amber-700";
  if (status === "保留") return "bg-slate-100 text-slate-700";
  if (status === "内定") return "bg-violet-100 text-violet-700";
  return "bg-slate-100 text-slate-600";
}

export type EventColorGroup = "submission" | "test" | "participation" | "selection" | "other";

/** Maps both the current default choices and older Sheets values to the four visual groups. */
export function eventColorGroup(type: string): EventColorGroup {
  const value = type.toLowerCase();
  const normalized = type.replace(/\s+/g, "");

  const includesAny = (words: string[]) => words.some((word) => normalized.includes(word));

  if (value.includes("es") || includesAny(["\u5c65\u6b74\u66f8", "\u8ab2\u984c\u63d0\u51fa", "\u30dd\u30fc\u30c8\u30d5\u30a9\u30ea\u30aa"])) return "submission";
  if (includesAny(["\u30c6\u30b9\u30c8", "Web\u30c6\u30b9\u30c8", "\u9069\u6027", "SPI", "\u6027\u683c\u691c\u67fb", "\u7389\u624b\u7bb1", "TG-WEB", "\u30b3\u30fc\u30c7\u30a3\u30f3\u30b0"]) || value.includes("spi") || value.includes("tg-web")) return "test";
  if (includesAny(["\u9078\u8003\u4f1a", "\u8aac\u660e\u9078\u8003\u4f1a", "\u9762\u63a5", "GD", "\u30b0\u30eb\u30fc\u30d7", "\u30b1\u30fc\u30b9"]) || value.includes("gd")) return "selection";
  if (includesAny(["\u8aac\u660e\u4f1a", "\u30bb\u30df\u30ca\u30fc", "\u9762\u8ac7", "\u30a4\u30f3\u30bf\u30fc\u30f3", "OB", "OG"]) || value.includes("ob")) return "participation";

  return "other";
}
export function eventTypeTone(type: string) {
  switch (eventColorGroup(type)) {
    case "submission":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "test":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "participation":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "selection":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-slate-200 bg-white text-slate-700";
  }
}

export function eventTextTone(type: string) {
  switch (eventColorGroup(type)) {
    case "submission":
      return "text-sky-700";
    case "test":
      return "text-emerald-700";
    case "participation":
      return "text-violet-700";
    case "selection":
      return "text-amber-800";
    default:
      return "text-slate-700";
  }
}

export function eventKindLabel(type: string) {
  if (type.includes("面談")) return "面談";
  if (type.includes("面接")) return "面接";
  if (type.includes("ES")) return "ES";
  if (type.includes("Web")) return "Webテスト";
  if (type.includes("適性")) return "適性検査";
  if (type.includes("説明")) return "説明会";
  if (type.includes("インターン")) return "インターン";
  if (type.includes("GD") || type.includes("グループ")) return "GD";
  if (type.includes("OB")) return "OB訪問";
  return type || "その他";
}

export function isInactiveStatus(status: string) {
  return inactiveStatuses.has(status);
}

function timelineCompanyScore(company: Company, events: SheetRow<JobEvent>[], today: number) {
  if (isInactiveStatus(company.status)) {
    return { group: 3, primary: -parseLooseTime(company.updated_at) };
  }

  const nextEventTime = sortEventsBySchedule(events)
    .filter((event) => !isInactiveStatus(event.status))
    .map((event) => eventDate(event))
    .filter((date): date is Date => Boolean(date))
    .map((date) => date.getTime())
    .find((time) => startOfDay(new Date(time)).getTime() >= today);

  if (nextEventTime !== undefined) {
    return { group: 1, primary: nextEventTime };
  }

  const latestEventTime = sortEventsBySchedule(events)
    .map((event) => eventDate(event))
    .filter((date): date is Date => Boolean(date))
    .map((date) => date.getTime())
    .filter((time) => startOfDay(new Date(time)).getTime() < today)
    .at(-1);

  return { group: 2, primary: -(latestEventTime ?? parseLooseTime(company.updated_at)) };
}

export function isDeadlineEvent(type: string) {
  return type.includes("ES") || type.includes("Web") || type.includes("適性") || type.includes("課題");
}

export function eventDate(event: JobEvent, displayTimeZone = event.timezone || defaultTimeZone) {
  if (event.start_datetime) {
    return convertZonedDateTime(event.start_datetime, event.timezone || defaultTimeZone, displayTimeZone)
      ?? parseDateTime(event.start_datetime);
  }

  return parseDate(event.period_end_date);
}

function getEventBucketKey(event: JobEvent, now: Date, displayTimeZone = defaultTimeZone): EventBucketKey {
  const date = eventDate(event, displayTimeZone);

  if (!date) {
    return "unscheduled";
  }

  const diff = dayDiff(startOfDay(now), startOfDay(date));

  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= daysUntilEndOfWeek(now)) return "thisWeek";
  if (diff <= daysUntilEndOfWeek(now) + 7) return "nextWeek";
  return "later";
}

function isHiddenEvent(event: JobEvent) {
  return "hidden" in event && String(event.hidden) === "true";
}

function parseDateTime(value: string) {
  if (!value) return null;
  const trimmed = value.trim();
  const matched = trimmed.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (matched) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = matched;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDate(value: string) {
  if (!value) return null;
  const trimmed = value.trim();
  const matched = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

  if (matched) {
    const [, year, month, day] = matched;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(`${trimmed}T00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseLooseTime(value: string) {
  if (!value) return 0;
  const date = parseDateTime(value) ?? new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dayDiff(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function daysUntilEndOfWeek(value: Date) {
  const day = value.getDay();
  return day === 0 ? 0 : 7 - day;
}

function formatMonthDay(value: Date) {
  return `${value.getMonth() + 1}/${value.getDate()}`;
}

function formatTime(value: Date) {
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
