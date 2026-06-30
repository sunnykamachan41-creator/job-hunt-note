import { z } from "zod";

import { normalizeDatetime } from "@/lib/datetime";
import { companyStatuses } from "@/types/company";
import { eventSelectionTypes, eventStatuses } from "@/types/event";

const uuidSchema = z.string().trim().uuid("IDが不正です");
const legacyIdSchema = z.string().trim().regex(/^[a-z]{3}\d+$/i, "IDが不正です");
const flexibleIdSchema = z.union([uuidSchema, legacyIdSchema]);
const optionalText = z.string().trim();
const timeZoneSchema = z.string().trim().min(1).default("Asia/Tokyo");
const optionalUrl = z
  .string()
  .trim()
  .transform((value) => normalizeUrl(value))
  .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), "URLは http:// または https:// で入力してください");
const datetimeSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/.test(value), "日時の形式が不正です")
  .transform((value) => normalizeDatetime(value));
const dateSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "日付の形式が不正です");
const booleanString = z.preprocess((value) => value ?? "false", z.enum(["false", "true"]));
const numericString = z
  .string()
  .trim()
  .refine((value) => value === "" || /^-?\d+$/.test(value), "数値で入力してください");

export const companyCreateSchema = z.object({
  company_name: z.string().trim().min(1, "企業名は必須です"),
  industry: optionalText,
  status: z.enum(companyStatuses).default("検討中"),
  mypage_url: optionalUrl,
  memo: optionalText,
  application_source: optionalText
});

export const companyUpdateSchema = companyCreateSchema.extend({
  company_id: flexibleIdSchema
});

export const companyDeleteSchema = z.object({
  company_id: flexibleIdSchema
});

const eventBaseSchema = z.object({
  company_id: flexibleIdSchema,
  selection_type: z.enum(eventSelectionTypes).default("本選考"),
  event_type: z.string().trim().min(1, "イベント種別は必須です"),
  title: optionalText,
  start_datetime: datetimeSchema,
  end_datetime: datetimeSchema,
  timezone: timeZoneSchema,
  is_period: booleanString.default("false"),
  period_end_date: dateSchema,
  event_series_id: optionalText.default(""),
  series_day_index: numericString.default(""),
  time_mode: z.enum(["datetime", "date_only"]).default("datetime"),
  status: z.enum(eventStatuses).default("予定"),
  person: optionalText,
  meeting_url: optionalUrl,
  memo: optionalText,
  sync_to_calendar: booleanString.default("false")
});

function validatePeriodEvent(
  value: { is_period: "false" | "true"; period_end_date: string },
  context: z.RefinementCtx
) {
  if (value.is_period === "true" && !value.period_end_date) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["period_end_date"],
      message: "期間イベントには終了日が必要です"
    });
  }
}

export const eventCreateSchema = eventBaseSchema.superRefine(validatePeriodEvent);

export const eventUpdateSchema = eventBaseSchema
  .extend({
    event_id: flexibleIdSchema,
    google_calendar_event_id: optionalText.default(""),
    calendar_last_synced_at: optionalText.default("")
  })
  .superRefine(validatePeriodEvent);

export const eventDeleteSchema = z.object({
  event_id: flexibleIdSchema
});

export const settingCreateSchema = z.object({
  group: z.string().trim().min(1, "グループは必須です"),
  parent: optionalText,
  value: z.string().trim().min(1, "値は必須です"),
  sort_order: numericString
});

export const settingUpdateSchema = settingCreateSchema.extend({
  setting_id: flexibleIdSchema
});

export const settingDeleteSchema = z.object({
  setting_id: flexibleIdSchema
});

export function formEntries(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function normalizeUrl(value: string) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(value)) {
    return `https://${value}`;
  }
  return value;
}

export function formatValidationError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join(" / ");
  }

  return error instanceof Error ? error.message : "処理に失敗しました";
}
