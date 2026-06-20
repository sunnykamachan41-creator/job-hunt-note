"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import { completeEventEndDatetime, nowInTokyo } from "@/lib/datetime";
import {
  appendSheetRow,
  deleteSheetRowById,
  findSheetRow,
  listSheetRows,
  updateSheetRowById
} from "@/lib/google-sheets";
import { formatValidationError, formEntries } from "@/lib/validation";
import {
  companyCreateSchema,
  companyDeleteSchema,
  companyUpdateSchema,
  eventCreateSchema,
  eventDeleteSchema,
  eventUpdateSchema,
  settingCreateSchema,
  settingDeleteSchema,
  settingUpdateSchema
} from "@/lib/validation";
import type { Company } from "@/types/company";
import type { JobEvent } from "@/types/event";
import type { Setting } from "@/types/settings";

type LocalCompanySyncInput = {
  company_id: string;
  company_name: string;
  industry: string;
  status: string;
  mypage_url: string;
  memo: string;
  application_source: string;
};

type LocalCompanyUpdateSyncInput = LocalCompanySyncInput;

type LocalEventSyncInput = {
  draft_id: string;
  company_id: string;
  selection_type: string;
  event_type: string;
  title: string;
  start_datetime: string;
  end_datetime: string;
  timezone: string;
  is_period: string;
  period_end_date: string;
  status: string;
  person: string;
  meeting_url: string;
  memo: string;
  sync_to_calendar: string;
};

type LocalEventUpdateSyncInput = LocalEventSyncInput & {
  event_id: string;
};

async function createCalendarEventForAction(...args: Parameters<typeof import("@/lib/google-calendar").createCalendarEvent>) {
  const { createCalendarEvent } = await import("@/lib/google-calendar");
  return createCalendarEvent(...args);
}

async function updateCalendarEventForAction(...args: Parameters<typeof import("@/lib/google-calendar").updateCalendarEvent>) {
  const { updateCalendarEvent } = await import("@/lib/google-calendar");
  return updateCalendarEvent(...args);
}

async function deleteCalendarEventForAction(...args: Parameters<typeof import("@/lib/google-calendar").deleteCalendarEvent>) {
  const { deleteCalendarEvent } = await import("@/lib/google-calendar");
  return deleteCalendarEvent(...args);
}

function redirectTarget(formData: FormData) {
  const value = formData.get("returnTo");

  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

function refresh(formData: FormData) {
  revalidatePath("/");
  const target = redirectTarget(formData);
  revalidatePath(target);
  redirect(target);
}

function fail(error: unknown, formData: FormData): never {
  const target = redirectTarget(formData);
  const separator = target.includes("?") ? "&" : "?";
  redirect(`${target}${separator}actionError=${encodeURIComponent(formatValidationError(error))}`);
}

export async function createCompany(formData: FormData) {
  try {
    const input = companyCreateSchema.parse(formEntries(formData));
    const now = nowInTokyo();

    await appendSheetRow("companies", {
      company_id: uuidv4(),
      ...input,
      recruitment_source: "",
      order_index: "0",
      created_at: now,
      updated_at: now,
      application_source: input.application_source
    } satisfies Company);
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

export async function syncLocalCompany(formData: FormData) {
  try {
    const input = companyCreateSchema.parse(formEntries(formData));
    const idValue = formData.get("company_id");
    const companyId = typeof idValue === "string" && idValue.trim() ? idValue.trim() : uuidv4();
    const now = nowInTokyo();

    await appendSheetRow("companies", {
      company_id: companyId,
      ...input,
      recruitment_source: "",
      order_index: "0",
      created_at: now,
      updated_at: now,
      application_source: input.application_source
    } satisfies Company);
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

export async function syncLocalDrafts(formData: FormData) {
  try {
    const companyDrafts = parseJsonArray<LocalCompanySyncInput>(formData.get("companies_json"));
    const eventDrafts = parseJsonArray<LocalEventSyncInput>(formData.get("events_json"));
    const companyUpdates = parseJsonArray<LocalCompanyUpdateSyncInput>(formData.get("company_updates_json"));
    const eventUpdates = parseJsonArray<LocalEventUpdateSyncInput>(formData.get("event_updates_json"));
    const now = nowInTokyo();
    const companyMap = new Map<string, Company>();

    for (const company of await listExistingCompanies()) {
      companyMap.set(company.company_id, company);
    }

    for (const draft of companyDrafts) {
      const input = companyCreateSchema.parse(draft);
      const companyId = draft.company_id || uuidv4();
      const company = {
        company_id: companyId,
        ...input,
        recruitment_source: "",
        order_index: "0",
        created_at: now,
        updated_at: now,
        application_source: input.application_source
      } satisfies Company;

      await appendSheetRow("companies", company);
      companyMap.set(company.company_id, company);
    }

    for (const draft of eventDrafts) {
      const input = eventCreateSchema.parse(draft);
      const company = companyMap.get(input.company_id);

      if (!company) {
        throw new Error(`企業が見つからないため予定を同期できません: ${input.company_id}`);
      }

      const end = completeEventEndDatetime(input.event_type, input.start_datetime, input.end_datetime);
      const eventId = draft.draft_id || uuidv4();
      let calendarEventId = "";
      let calendarLastSyncedAt = "";
      let syncToCalendar = input.sync_to_calendar;
      const event = {
        event_id: eventId,
        company_id: input.company_id,
        selection_type: input.selection_type,
        event_type: input.event_type,
        title: input.title,
        start_datetime: input.start_datetime,
        end_datetime: end,
        timezone: input.timezone,
        is_period: input.is_period,
        period_end_date: input.period_end_date,
        status: input.status,
        person: input.person,
        meeting_url: input.meeting_url,
        memo: input.memo,
        sync_to_calendar: input.sync_to_calendar,
        google_calendar_event_id: "",
        calendar_last_synced_at: "",
        created_at: now,
        updated_at: now
      } satisfies JobEvent;

      if (input.sync_to_calendar === "true") {
        try {
          calendarEventId = await createCalendarEventForAction(event, company);
          calendarLastSyncedAt = nowInTokyo();
        } catch (error) {
          console.error("Google Calendar event creation failed", error);
          syncToCalendar = "false";
        }
      }

      await appendSheetRow("events", {
        ...event,
        sync_to_calendar: syncToCalendar,
        google_calendar_event_id: calendarEventId,
        calendar_last_synced_at: calendarLastSyncedAt
      } satisfies JobEvent);
    }

    for (const draft of companyUpdates) {
      const input = companyUpdateSchema.parse(draft);
      const existing = await findSheetRow<Company>(
        "companies",
        (company) => company.company_id === input.company_id,
        `company_id "${input.company_id}"`
      );

      await updateSheetRowById("companies", "company_id", input.company_id, {
        company_id: input.company_id,
        company_name: input.company_name,
        industry: input.industry,
        status: input.status,
        recruitment_source: existing.recruitment_source,
        order_index: existing.order_index,
        mypage_url: input.mypage_url,
        memo: input.memo,
        created_at: existing.created_at,
        updated_at: now,
        application_source: input.application_source
      } satisfies Company);
      companyMap.set(input.company_id, {
        ...existing,
        company_name: input.company_name,
        industry: input.industry,
        status: input.status,
        mypage_url: input.mypage_url,
        memo: input.memo,
        updated_at: now,
        application_source: input.application_source
      });
    }

    for (const draft of eventUpdates) {
      const input = eventUpdateSchema.parse(draft);
      const company = companyMap.get(input.company_id) ?? await assertCompanyExists(input.company_id);
      const existing = await findSheetRow<JobEvent>(
        "events",
        (event) => event.event_id === input.event_id,
        `event_id "${input.event_id}"`
      );
      const end = completeEventEndDatetime(input.event_type, input.start_datetime, input.end_datetime);
      let calendarEventId = existing.google_calendar_event_id;
      let calendarLastSyncedAt = existing.calendar_last_synced_at;
      const nextEvent = {
        event_id: input.event_id,
        company_id: input.company_id,
        selection_type: input.selection_type,
        event_type: input.event_type,
        title: input.title,
        start_datetime: input.start_datetime,
        end_datetime: end,
        timezone: input.timezone,
        is_period: input.is_period,
        period_end_date: input.period_end_date,
        status: input.status,
        person: input.person,
        meeting_url: input.meeting_url,
        memo: input.memo,
        sync_to_calendar: input.sync_to_calendar,
        google_calendar_event_id: calendarEventId,
        calendar_last_synced_at: calendarLastSyncedAt,
        created_at: existing.created_at,
        updated_at: now
      } satisfies JobEvent;

      if (input.sync_to_calendar === "true" && calendarEventId) {
        await updateCalendarEventForAction(nextEvent, company);
        calendarLastSyncedAt = nowInTokyo();
      } else if (input.sync_to_calendar === "true" && !calendarEventId) {
        calendarEventId = await createCalendarEventForAction(nextEvent, company);
        calendarLastSyncedAt = nowInTokyo();
      } else if (input.sync_to_calendar === "false" && calendarEventId) {
        await deleteCalendarEventForAction(calendarEventId);
        calendarEventId = "";
        calendarLastSyncedAt = "";
      }

      await updateSheetRowById("events", "event_id", input.event_id, {
        ...nextEvent,
        google_calendar_event_id: calendarEventId,
        calendar_last_synced_at: calendarLastSyncedAt
      } satisfies JobEvent);
    }
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

export async function updateCompany(formData: FormData) {
  try {
    const input = companyUpdateSchema.parse(formEntries(formData));
    const existing = await findSheetRow<Company>(
      "companies",
      (company) => company.company_id === input.company_id,
      `company_id "${input.company_id}"`
    );
    const now = nowInTokyo();

    await updateSheetRowById("companies", "company_id", input.company_id, {
      company_id: input.company_id,
      company_name: input.company_name,
      industry: input.industry,
      status: input.status,
      recruitment_source: existing.recruitment_source,
      order_index: existing.order_index,
      mypage_url: input.mypage_url,
      memo: input.memo,
      created_at: existing.created_at,
      updated_at: now,
      application_source: input.application_source
    } satisfies Company);
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

export async function deleteCompany(formData: FormData) {
  try {
    const input = companyDeleteSchema.parse(formEntries(formData));
    await deleteSheetRowById("companies", "company_id", input.company_id);
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

export async function createEvent(formData: FormData) {
  try {
    const input = eventCreateSchema.parse(formEntries(formData));
    const company = await assertCompanyExists(input.company_id);
    const now = nowInTokyo();
    const end = completeEventEndDatetime(input.event_type, input.start_datetime, input.end_datetime);
    const eventId = uuidv4();
    let calendarEventId = "";
    let calendarLastSyncedAt = "";
    let syncToCalendar = input.sync_to_calendar;
    const event = {
      event_id: eventId,
      company_id: input.company_id,
      selection_type: input.selection_type,
      event_type: input.event_type,
      title: input.title,
      start_datetime: input.start_datetime,
      end_datetime: end,
      timezone: input.timezone,
      is_period: input.is_period,
      period_end_date: input.period_end_date,
      status: input.status,
      person: input.person,
      meeting_url: input.meeting_url,
      memo: input.memo,
      sync_to_calendar: input.sync_to_calendar,
      google_calendar_event_id: "",
      calendar_last_synced_at: "",
      created_at: now,
      updated_at: now
    } satisfies JobEvent;

    if (input.sync_to_calendar === "true") {
      try {
        calendarEventId = await createCalendarEventForAction(event, company);
        calendarLastSyncedAt = nowInTokyo();
      } catch (error) {
        console.error("Google Calendar event creation failed", error);
        syncToCalendar = "false";
      }
    }

    await appendSheetRow("events", {
      ...event,
      sync_to_calendar: syncToCalendar,
      google_calendar_event_id: calendarEventId,
      calendar_last_synced_at: calendarLastSyncedAt
    } satisfies JobEvent);
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

export async function updateEvent(formData: FormData) {
  try {
    const input = eventUpdateSchema.parse(formEntries(formData));
    const company = await assertCompanyExists(input.company_id);
    const existing = await findSheetRow<JobEvent>(
      "events",
      (event) => event.event_id === input.event_id,
      `event_id "${input.event_id}"`
    );
    const now = nowInTokyo();
    const end = completeEventEndDatetime(input.event_type, input.start_datetime, input.end_datetime);
    let calendarEventId = existing.google_calendar_event_id;
    let calendarLastSyncedAt = existing.calendar_last_synced_at;
    const nextEvent = {
      event_id: input.event_id,
      company_id: input.company_id,
      selection_type: input.selection_type,
      event_type: input.event_type,
      title: input.title,
      start_datetime: input.start_datetime,
      end_datetime: end,
      timezone: input.timezone,
      is_period: input.is_period,
      period_end_date: input.period_end_date,
      status: input.status,
      person: input.person,
      meeting_url: input.meeting_url,
      memo: input.memo,
      sync_to_calendar: input.sync_to_calendar,
      google_calendar_event_id: calendarEventId,
      calendar_last_synced_at: calendarLastSyncedAt,
      created_at: existing.created_at,
      updated_at: now
    } satisfies JobEvent;

    if (input.sync_to_calendar === "true" && calendarEventId) {
      try {
        await updateCalendarEventForAction(nextEvent, company);
        calendarLastSyncedAt = nowInTokyo();
      } catch (error) {
        console.error("Google Calendar event update failed", error);
      }
    } else if (input.sync_to_calendar === "true" && !calendarEventId) {
      try {
        calendarEventId = await createCalendarEventForAction(nextEvent, company);
        calendarLastSyncedAt = nowInTokyo();
      } catch (error) {
        console.error("Google Calendar event creation failed", error);
      }
    } else if (input.sync_to_calendar === "false" && calendarEventId) {
      try {
        await deleteCalendarEventForAction(calendarEventId);
        calendarEventId = "";
        calendarLastSyncedAt = "";
      } catch (error) {
        console.error("Google Calendar event deletion failed", error);
      }
    }

    await updateSheetRowById("events", "event_id", input.event_id, {
      ...nextEvent,
      google_calendar_event_id: calendarEventId,
      calendar_last_synced_at: calendarLastSyncedAt
    } satisfies JobEvent);
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

export async function deleteEvent(formData: FormData) {
  try {
    const input = eventDeleteSchema.parse(formEntries(formData));
    const existing = await findSheetRow<JobEvent>(
      "events",
      (event) => event.event_id === input.event_id,
      `event_id "${input.event_id}"`
    );

    if (existing.google_calendar_event_id) {
      await deleteCalendarEventForAction(existing.google_calendar_event_id);
    }

    await deleteSheetRowById("events", "event_id", input.event_id);
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

export async function createSetting(formData: FormData) {
  try {
    const input = settingCreateSchema.parse(formEntries(formData));
    const now = nowInTokyo();

    await appendSheetRow("settings", {
      setting_id: uuidv4(),
      group: input.group,
      parent: input.parent,
      value: input.value,
      sort_order: input.sort_order,
      created_at: now,
      updated_at: now
    } satisfies Setting);
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

export async function updateSetting(formData: FormData) {
  try {
    const input = settingUpdateSchema.parse(formEntries(formData));
    const existing = await findSheetRow<Setting>(
      "settings",
      (setting) => setting.setting_id === input.setting_id,
      `setting_id "${input.setting_id}"`
    );
    const now = nowInTokyo();

    await updateSheetRowById(
      "settings",
      "setting_id",
      input.setting_id,
      {
        setting_id: input.setting_id,
        group: input.group,
        parent: input.parent,
        value: input.value,
        sort_order: input.sort_order,
        created_at: existing.created_at,
        updated_at: now
      } satisfies Setting
    );
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

export async function deleteSetting(formData: FormData) {
  try {
    const input = settingDeleteSchema.parse(formEntries(formData));
    await deleteSheetRowById("settings", "setting_id", input.setting_id);
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

async function assertCompanyExists(companyId: string) {
  return findSheetRow<Company>(
    "companies",
    (company) => company.company_id === companyId,
    `company_id "${companyId}"`
  );
}

async function listExistingCompanies() {
  return listSheetRows<Company>("companies", { fresh: true });
}

function parseJsonArray<T>(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) return [];

  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("同期データの形式が不正です");
  }

  return parsed as T[];
}
