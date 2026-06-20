"use client";

import { useLocalEventDrafts, useLocalEventUpdates } from "@/components/local-draft-sync-panel";
import type { SheetRow } from "@/lib/google-sheets";
import { eventTextTone, eventTypeTone } from "@/lib/planning";
import type { Company } from "@/types/company";

export function LocalDraftTimeline({
  companies,
  rangeStart,
  dayWidth,
  rowHeight,
  leftColumnWidth,
  topOffset,
  timelineWidth
}: {
  companies: SheetRow<Company>[];
  rangeStart: string;
  dayWidth: number;
  rowHeight: number;
  leftColumnWidth: number;
  topOffset: number;
  timelineWidth: number;
}) {
  const drafts = useLocalEventDrafts();
  const updates = useLocalEventUpdates();
  const start = new Date(rangeStart);
  const visibleItems = [
    ...drafts.map((draft) => ({ ...draft, localKind: "draft" as const })),
    ...updates.map((draft) => ({ ...draft, draft_id: draft.event_id, localKind: "update" as const }))
  ];

  if (!visibleItems.length) return null;

  return (
    <div className="pointer-events-none absolute z-30" style={{ left: leftColumnWidth, top: topOffset, width: timelineWidth }}>
      {visibleItems.map((draft) => {
        const companyIndex = companies.findIndex((company) => company.company_id === draft.company_id);
        const date = parseDate(draft.start_datetime);
        if (companyIndex < 0 || !date) return null;

        const left = Math.max(4, dayDiff(start, date) * dayWidth + 4);
        if (left < 0 || left > timelineWidth) return null;

        const top = companyIndex * rowHeight + Math.max(5, (rowHeight - 34) / 2);
        const tone = eventTypeTone(draft.event_type);
        const textTone = eventTextTone(draft.event_type);

        return (
          <div key={draft.draft_id} className="absolute" style={{ left, top }}>
            <span
              className={`pointer-events-auto block h-[34px] w-[18px] rounded-md border border-dashed opacity-80 shadow-sm ring-1 ring-inset ${tone}`}
              title={`${draft.event_type} ${draft.start_datetime} ${draft.localKind === "update" ? "未同期編集" : "未同期"}`}
            />
            <span className={`pointer-events-none absolute left-[26px] top-0 whitespace-nowrap text-[11px] font-bold ${textTone}`}>
              {timeLabel(date)} {draft.event_type} <span className="text-amber-600">{draft.localKind === "update" ? "未同期編集" : "未同期"}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayDiff(from: Date, to: Date) {
  const left = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const right = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((right - left) / 86_400_000);
}

function timeLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
