import { promises as fs } from "fs";
import path from "path";

import { GaxiosError } from "gaxios";
import { google, calendar_v3 } from "googleapis";
import { v4 as uuidv4 } from "uuid";

import { defaultTimeZone } from "@/lib/datetime";
import {
  appendSheetRow,
  listSheetRows,
  updateSheetRowById
} from "@/lib/google-sheets";
import type { Company } from "@/types/company";
import type { JobEvent } from "@/types/event";
import type { Setting } from "@/types/settings";

const tokenPath = path.join(process.cwd(), ".google-calendar-token.json");
const targetCalendarName = "就活";
const calendarScope = "https://www.googleapis.com/auth/calendar";
const emailScope = "https://www.googleapis.com/auth/userinfo.email";

type StoredCalendarToken = {
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    scope?: string | null;
    token_type?: string | null;
    expiry_date?: number | null;
  };
  email: string;
  calendar_id?: string;
  calendar_name?: string;
  connected_at: string;
};

export type CalendarConnectionInfo = {
  connected: boolean;
  email: string;
  calendarId: string;
  calendarName: string;
};

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

function getRedirectUri() {
  return process.env.GOOGLE_CALENDAR_REDIRECT_URI ?? "http://127.0.0.1:3000/api/google-calendar/callback";
}

export function getOAuthClient() {
  return new google.auth.OAuth2(
    requiredEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    requiredEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
    getRedirectUri()
  );
}

export function getCalendarAuthUrl() {
  const client = getOAuthClient();

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [calendarScope, emailScope]
  });
}

export async function saveCalendarOAuthCode(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error("Google Calendar refresh token was not returned. Reconnect with consent prompt.");
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const profile = await oauth2.userinfo.get();
  const email = profile.data.email ?? "";

  if (!email) {
    throw new Error("Google account email could not be resolved");
  }

  const calendar = google.calendar({ version: "v3", auth: client });
  const calendarId = await ensureTargetCalendar(calendar);

  await fs.writeFile(
    tokenPath,
    JSON.stringify(
      {
        tokens,
        email,
        calendar_id: calendarId,
        calendar_name: targetCalendarName,
        connected_at: new Date().toISOString()
      } satisfies StoredCalendarToken,
      null,
      2
    ),
    { mode: 0o600 }
  );

  await saveCalendarSettings({
    connected: "true",
    email,
    calendarId,
    calendarName: targetCalendarName
  });
}

export async function getCalendarConnectionInfo(): Promise<CalendarConnectionInfo> {
  try {
    const token = await readStoredToken();
    return {
      connected: Boolean(token.tokens.refresh_token),
      email: token.email,
      calendarId: token.calendar_id ?? "",
      calendarName: token.calendar_name ?? targetCalendarName
    };
  } catch {
    return { connected: false, email: "", calendarId: "", calendarName: targetCalendarName };
  }
}

async function readStoredToken() {
  try {
    const raw = await fs.readFile(tokenPath, "utf8");
    return JSON.parse(raw) as StoredCalendarToken;
  } catch (error) {
    if (isNodeFileError(error) && error.code === "ENOENT") {
      throw new Error("Google Calendar is not connected. Open Settings and connect Google Calendar before syncing calendar events.");
    }

    throw error;
  }
}

async function getCalendarClient() {
  const stored = await readStoredToken();
  const client = getOAuthClient();
  client.setCredentials({
    access_token: stored.tokens.access_token ?? undefined,
    refresh_token: stored.tokens.refresh_token ?? undefined,
    scope: stored.tokens.scope ?? undefined,
    token_type: stored.tokens.token_type ?? undefined,
    expiry_date: stored.tokens.expiry_date ?? undefined
  });

  return google.calendar({ version: "v3", auth: client });
}

async function getTargetCalendarId(calendar: calendar_v3.Calendar) {
  const stored = await readStoredToken();

  if (stored.calendar_id) {
    return stored.calendar_id;
  }

  const calendarId = await ensureTargetCalendar(calendar);
  await fs.writeFile(
    tokenPath,
    JSON.stringify(
      {
        ...stored,
        calendar_id: calendarId,
        calendar_name: targetCalendarName
      } satisfies StoredCalendarToken,
      null,
      2
    ),
    { mode: 0o600 }
  );
  await saveCalendarSettings({
    connected: "true",
    email: stored.email,
    calendarId,
    calendarName: targetCalendarName
  });

  return calendarId;
}

async function ensureTargetCalendar(calendar: calendar_v3.Calendar) {
  const calendarTimeZone = await getConfiguredTimeZone();
  let pageToken: string | undefined;

  do {
    const response = await calendar.calendarList.list({
      maxResults: 250,
      pageToken
    });
    const found = response.data.items?.find((item) => item.summary === targetCalendarName && item.id);

    if (found?.id) {
      return found.id;
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  const created = await calendar.calendars.insert({
    requestBody: {
      summary: targetCalendarName,
      timeZone: calendarTimeZone
    }
  });

  if (!created.data.id) {
    throw new Error("Google Calendar calendar id was not returned");
  }

  return created.data.id;
}

async function saveCalendarSettings({
  connected,
  email,
  calendarId,
  calendarName
}: {
  connected: string;
  email: string;
  calendarId: string;
  calendarName: string;
}) {
  const configuredTimeZone = await getConfiguredTimeZone();
  const entries = [
    ["google_calendar_connected", connected, "910"],
    ["google_calendar_email", email, "920"],
    ["google_calendar_id", calendarId, "930"],
    ["google_calendar_name", calendarName, "940"],
    ["event_default_timezone", configuredTimeZone, "950"],
    ["ui_default_timezone", configuredTimeZone, "960"]
  ] as const;

  await Promise.all(entries.map(([group, value, sortOrder]) => upsertAppSetting(group, value, sortOrder)));
}

async function upsertAppSetting(group: string, value: string, sortOrder: string) {
  const rows = await listSheetRows<Setting>("settings");
  const existing = rows.find((setting) => setting.group === group);
  const now = new Date().toISOString();

  if (existing) {
    await updateSheetRowById("settings", "setting_id", existing.setting_id, {
      setting_id: existing.setting_id,
      group,
      parent: "",
      value,
      sort_order: existing.sort_order || sortOrder,
      created_at: existing.created_at,
      updated_at: now
    });
    return;
  }

  await appendSheetRow("settings", {
    setting_id: uuidv4(),
    group,
    parent: "",
    value,
    sort_order: sortOrder,
    created_at: now,
    updated_at: now
  });
}

async function buildCalendarResource(event: JobEvent, company: Company): Promise<calendar_v3.Schema$Event> {
  const calendarTimeZone = event.timezone?.trim() || await getConfiguredTimeZone();
  const title = `${company.company_name} | ${event.event_type}`;
  const description = [
    `company: ${company.company_name}`,
    `event type: ${event.event_type}`,
    event.meeting_url ? `URL: ${event.meeting_url}` : "",
    event.person ? `interviewer: ${event.person}` : "",
    event.memo ? `notes: ${event.memo}` : ""
  ].filter(Boolean).join("\n");

  if (event.start_datetime) {
    const start = toCalendarDateTime(event.start_datetime);
    const end = toCalendarDateTime(event.end_datetime || addMinutes(event.start_datetime, 60));

    return {
      summary: title,
      description,
      location: event.meeting_url || undefined,
      start: { dateTime: start, timeZone: calendarTimeZone },
      end: { dateTime: end, timeZone: calendarTimeZone }
    };
  }

  const date = event.period_end_date || new Date().toISOString().slice(0, 10);

  return {
    summary: title,
    description,
    location: event.meeting_url || undefined,
    start: { date },
    end: { date: addDays(date, 1) }
  };
}

async function getConfiguredTimeZone() {
  try {
    const settings = await listSheetRows<Setting>("settings");
    const configured = settings.find((setting) => setting.group === "event_default_timezone")?.value.trim()
      || settings.find((setting) => setting.group === "timezone")?.value.trim();
    return configured || defaultTimeZone;
  } catch {
    return defaultTimeZone;
  }
}

function toCalendarDateTime(value: string) {
  return value.includes("T") ? value : value.replace(" ", "T");
}

function addMinutes(value: string, minutes: number) {
  const matched = toCalendarDateTime(value).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})T(\d{1,2}):(\d{2})/);

  if (!matched) {
    return value;
  }

  const [, year, month, day, hour, minute] = matched;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  date.setMinutes(date.getMinutes() + minutes);
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isNodeFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export async function createCalendarEvent(event: JobEvent, company: Company) {
  const calendar = await getCalendarClient();
  const calendarId = await getTargetCalendarId(calendar);
  const response = await calendar.events.insert({
    calendarId,
    requestBody: await buildCalendarResource(event, company)
  });

  if (!response.data.id) {
    throw new Error("Google Calendar event id was not returned");
  }

  return response.data.id;
}

export async function updateCalendarEvent(event: JobEvent, company: Company) {
  if (!event.google_calendar_event_id) {
    throw new Error("google_calendar_event_id is missing");
  }

  const calendar = await getCalendarClient();
  const calendarId = await getTargetCalendarId(calendar);
  await calendar.events.update({
    calendarId,
    eventId: event.google_calendar_event_id,
    requestBody: await buildCalendarResource(event, company)
  });
}

export async function deleteCalendarEvent(calendarEventId: string) {
  const calendar = await getCalendarClient();
  const calendarId = await getTargetCalendarId(calendar);

  try {
    await calendar.events.delete({
      calendarId,
      eventId: calendarEventId
    });
  } catch (error) {
    if (error instanceof GaxiosError && (error.response?.status === 404 || error.response?.status === 410)) {
      return;
    }

    throw error;
  }
}
