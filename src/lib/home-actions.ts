"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import { nowInTokyo } from "@/lib/datetime";
import {
  appendSheetRow,
  deleteSheetRowById,
  findSheetRow,
  updateSheetRowById
} from "@/lib/google-sheets";
import { formatValidationError, formEntries } from "@/lib/validation";
import {
  companyDeleteSchema,
  eventDeleteSchema,
  settingCreateSchema,
  settingDeleteSchema,
  settingUpdateSchema
} from "@/lib/validation";
import type { Setting } from "@/types/settings";
import type { JobEvent } from "@/types/event";

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

export async function deleteCompanyFromHome(formData: FormData) {
  try {
    const input = companyDeleteSchema.parse(formEntries(formData));
    await deleteSheetRowById("companies", "company_id", input.company_id);
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

export async function deleteEventFromHome(formData: FormData) {
  try {
    const input = eventDeleteSchema.parse(formEntries(formData));
    const existing = await findSheetRow<JobEvent>(
      "events",
      (event) => event.event_id === input.event_id,
      `event_id "${input.event_id}"`,
      { fresh: true }
    );

    if (existing.google_calendar_event_id) {
      const { deleteCalendarEvent } = await import("@/lib/google-calendar");
      await deleteCalendarEvent(existing.google_calendar_event_id);
    }

    await deleteSheetRowById("events", "event_id", input.event_id);
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

export async function createSettingFromHome(formData: FormData) {
  try {
    const input = settingCreateSchema.parse(formEntries(formData));
    const now = nowInTokyo();

    await appendSheetRow("settings", {
      setting_id: uuidv4(),
      ...input,
      created_at: now,
      updated_at: now
    } satisfies Setting);
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

export async function updateSettingFromHome(formData: FormData) {
  try {
    const input = settingUpdateSchema.parse(formEntries(formData));
    const now = nowInTokyo();

    await updateSheetRowById("settings", "setting_id", input.setting_id, {
      setting_id: input.setting_id,
      group: input.group,
      parent: input.parent,
      value: input.value,
      sort_order: input.sort_order,
      created_at: "",
      updated_at: now
    } satisfies Setting);
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}

export async function deleteSettingFromHome(formData: FormData) {
  try {
    const input = settingDeleteSchema.parse(formEntries(formData));
    await deleteSheetRowById("settings", "setting_id", input.setting_id);
  } catch (error) {
    fail(error, formData);
  }
  refresh(formData);
}
