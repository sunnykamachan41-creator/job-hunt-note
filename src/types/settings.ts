export type Setting = {
  setting_id: string;
  group: string;
  parent: string;
  value: string;
  sort_order: string;
  created_at: string;
  updated_at: string;
};

export const settingColumns = [
  "setting_id",
  "group",
  "parent",
  "value",
  "sort_order",
  "created_at",
  "updated_at"
] as const satisfies readonly (keyof Setting)[];
