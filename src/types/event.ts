export const eventStatuses = ["予定", "完了", "結果待ち", "通過", "落選", "辞退", "保留", "内定"] as const;
export const eventSelectionTypes = ["本選考", "インターン"] as const;

export const deadlineEventTypes = ["ES", "ES提出", "Webテスト", "適性検査"] as const;
export const defaultDurationEventTypes = ["面接", "一次面接", "二次面接", "最終面接", "面談"] as const;

export type EventStatus = (typeof eventStatuses)[number];
export type EventSelectionType = (typeof eventSelectionTypes)[number];

export type JobEvent = {
  event_id: string;
  company_id: string;
  selection_type: EventSelectionType | string;
  event_type: string;
  title: string;
  start_datetime: string;
  end_datetime: string;
  timezone: string;
  is_period: string;
  period_end_date: string;
  event_series_id: string;
  series_day_index: string;
  time_mode: "datetime" | "date_only" | string;
  status: EventStatus | string;
  person: string;
  meeting_url: string;
  memo: string;
  sync_to_calendar: string;
  google_calendar_event_id: string;
  calendar_last_synced_at: string;
  created_at: string;
  updated_at: string;
};

export type JobEventInput = Omit<JobEvent, "event_id" | "created_at" | "updated_at">;

export const eventColumns = [
  "event_id",
  "company_id",
  "selection_type",
  "event_type",
  "title",
  "start_datetime",
  "end_datetime",
  "timezone",
  "is_period",
  "period_end_date",
  "status",
  "person",
  "meeting_url",
  "memo",
  "sync_to_calendar",
  "google_calendar_event_id",
  "calendar_last_synced_at",
  "created_at",
  "updated_at",
  "event_series_id",
  "series_day_index",
  "time_mode"
] as const satisfies readonly (keyof JobEvent)[];
