import { companyColumns } from "@/types/company";
import { eventColumns } from "@/types/event";
import { settingColumns } from "@/types/settings";

export const sheetNames = {
  companies: "companies",
  events: "events",
  settings: "settings"
} as const;

export const sheetSchemas = {
  companies: companyColumns,
  events: eventColumns,
  settings: settingColumns
} as const;

export type SheetKey = keyof typeof sheetSchemas;
