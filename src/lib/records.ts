import type { Company } from "@/types/company";
import type { JobEvent } from "@/types/event";
import type { Setting } from "@/types/settings";

export type CompanyRecord = Company;

export type JobEventRecord = Omit<JobEvent, "is_period" | "sync_to_calendar"> & {
  is_period: boolean;
  sync_to_calendar: boolean;
};

export type SettingRecord = Omit<Setting, "sort_order"> & {
  sort_order: number;
};

export function parseNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function parseBoolean(value: string) {
  return value === "true";
}

export function toSheetBoolean(value: boolean) {
  return value ? "true" : "false";
}

export function toCompanyRecord(company: Company): CompanyRecord {
  return company;
}

export function toJobEventRecord(event: JobEvent): JobEventRecord {
  return {
    ...event,
    is_period: parseBoolean(event.is_period),
    sync_to_calendar: parseBoolean(event.sync_to_calendar)
  };
}

export function toSettingRecord(setting: Setting): SettingRecord {
  return {
    ...setting,
    sort_order: parseNumber(setting.sort_order)
  };
}
