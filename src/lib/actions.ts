"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import { completeEventEndDatetime, normalizeDatetime, nowInTokyo } from "@/lib/datetime";
import { appendSheetRow, deleteSheetRow, updateSheetRow } from "@/lib/google-sheets";
import type { Company } from "@/types/company";
import type { JobEvent } from "@/types/event";
import type { Setting } from "@/types/settings";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function rowNumber(formData: FormData) {
  const value = Number(text(formData, "_rowNumber"));

  if (!Number.isInteger(value) || value < 2) {
    throw new Error("Invalid row number");
  }

  return value;
}

function refresh() {
  revalidatePath("/");
  redirect("/");
}

export async function createCompany(formData: FormData) {
  const now = nowInTokyo();

  await appendSheetRow("companies", {
    company_id: uuidv4(),
    company_name: text(formData, "company_name"),
    category: text(formData, "category") || "インターン",
    industry: text(formData, "industry"),
    status: text(formData, "status") || "選考中",
    recruitment_source: text(formData, "recruitment_source"),
    order_index: text(formData, "order_index"),
    mypage_url: text(formData, "mypage_url"),
    memo: text(formData, "memo"),
    created_at: now,
    updated_at: now
  } satisfies Company);

  refresh();
}

export async function updateCompany(formData: FormData) {
  const now = nowInTokyo();

  await updateSheetRow("companies", rowNumber(formData), {
    company_id: text(formData, "company_id"),
    company_name: text(formData, "company_name"),
    category: text(formData, "category"),
    industry: text(formData, "industry"),
    status: text(formData, "status"),
    recruitment_source: text(formData, "recruitment_source"),
    order_index: text(formData, "order_index"),
    mypage_url: text(formData, "mypage_url"),
    memo: text(formData, "memo"),
    created_at: text(formData, "created_at"),
    updated_at: now
  } satisfies Company);

  refresh();
}

export async function deleteCompany(formData: FormData) {
  await deleteSheetRow("companies", rowNumber(formData));
  refresh();
}

export async function createEvent(formData: FormData) {
  const now = nowInTokyo();
  const eventType = text(formData, "event_type");
  const start = normalizeDatetime(formData.get("start_datetime"));
  const end = completeEventEndDatetime(
    eventType,
    start,
    normalizeDatetime(formData.get("end_datetime"))
  );

  await appendSheetRow("events", {
    event_id: uuidv4(),
    company_id: text(formData, "company_id"),
    event_type: eventType,
    title: text(formData, "title"),
    start_datetime: start,
    end_datetime: end,
    is_period: text(formData, "is_period") || "false",
    period_end_date: text(formData, "period_end_date"),
    status: text(formData, "status") || "予定",
    person: text(formData, "person"),
    meeting_url: text(formData, "meeting_url"),
    memo: text(formData, "memo"),
    google_calendar_created: "false",
    google_calendar_event_ids: "",
    google_event_id: "",
    created_at: now,
    updated_at: now
  } satisfies JobEvent);

  refresh();
}

export async function updateEvent(formData: FormData) {
  const now = nowInTokyo();
  const eventType = text(formData, "event_type");
  const start = normalizeDatetime(formData.get("start_datetime"));
  const end = completeEventEndDatetime(
    eventType,
    start,
    normalizeDatetime(formData.get("end_datetime"))
  );

  await updateSheetRow("events", rowNumber(formData), {
    event_id: text(formData, "event_id"),
    company_id: text(formData, "company_id"),
    event_type: eventType,
    title: text(formData, "title"),
    start_datetime: start,
    end_datetime: end,
    is_period: text(formData, "is_period") || "false",
    period_end_date: text(formData, "period_end_date"),
    status: text(formData, "status"),
    person: text(formData, "person"),
    meeting_url: text(formData, "meeting_url"),
    memo: text(formData, "memo"),
    google_calendar_created: text(formData, "google_calendar_created") || "false",
    google_calendar_event_ids: text(formData, "google_calendar_event_ids"),
    google_event_id: text(formData, "google_event_id"),
    created_at: text(formData, "created_at"),
    updated_at: now
  } satisfies JobEvent);

  refresh();
}

export async function deleteEvent(formData: FormData) {
  await deleteSheetRow("events", rowNumber(formData));
  refresh();
}

export async function createSetting(formData: FormData) {
  await appendSheetRow("settings", {
    group: text(formData, "group"),
    parent: text(formData, "parent"),
    value: text(formData, "value"),
    sort_order: text(formData, "sort_order")
  } satisfies Setting);

  refresh();
}

export async function updateSetting(formData: FormData) {
  await updateSheetRow("settings", rowNumber(formData), {
    group: text(formData, "group"),
    parent: text(formData, "parent"),
    value: text(formData, "value"),
    sort_order: text(formData, "sort_order")
  } satisfies Setting);

  refresh();
}

export async function deleteSetting(formData: FormData) {
  await deleteSheetRow("settings", rowNumber(formData));
  refresh();
}
