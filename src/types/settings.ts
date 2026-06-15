export type Setting = {
  group: string;
  parent: string;
  value: string;
  sort_order: string;
};

export const settingColumns = [
  "group",
  "parent",
  "value",
  "sort_order"
] as const satisfies readonly (keyof Setting)[];
