"use client";

import { useEffect, useMemo, useState } from "react";

import { openEditTarget } from "@/components/edit-entity-actions";
import { saveLocalEventDelete } from "@/components/local-draft-sync-panel";
import type { SheetRow } from "@/lib/google-sheets";
import { eventKindLabel, eventScheduleRangeLabel } from "@/lib/planning";
import type { Company } from "@/types/company";
import type { JobEvent } from "@/types/event";

const openTimelineEventName = "job-hunt-note:timeline-event-open";

type PopoverState = {
  eventId: string;
  x: number;
  y: number;
};

export function TimelineEventOpenButton({
  eventId,
  className,
  title,
  children,
  ariaLabel
}: {
  eventId: string;
  className: string;
  title: string;
  children?: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-label={ariaLabel ?? title}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        const rect = clickEvent.currentTarget.getBoundingClientRect();
        window.dispatchEvent(new CustomEvent(openTimelineEventName, {
          detail: {
            eventId,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height
          } satisfies PopoverState
        }));
      }}
    >
      {children}
    </button>
  );
}

export function TimelineEventPopoverLayer({
  events,
  companies,
  timeZone
}: {
  events: SheetRow<JobEvent>[];
  companies: SheetRow<Company>[];
  timeZone: string;
}) {
  const [state, setState] = useState<PopoverState | null>(null);
  const eventById = useMemo(() => new Map(events.map((event) => [event.event_id, event])), [events]);
  const companyById = useMemo(() => new Map(companies.map((company) => [company.company_id, company])), [companies]);

  useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<PopoverState>).detail;
      if (detail?.eventId) {
        setState(detail);
      }
    }

    window.addEventListener(openTimelineEventName, onOpen);
    return () => window.removeEventListener(openTimelineEventName, onOpen);
  }, []);

  if (!state) return null;

  const event = eventById.get(state.eventId);
  const company = event ? companyById.get(event.company_id) : undefined;

  if (!event || !company) return null;

  const width = 420;
  const left = Math.min(Math.max(16, state.x - width / 2), Math.max(16, window.innerWidth - width - 16));
  const top = Math.min(Math.max(80, state.y + 10), Math.max(80, window.innerHeight - 420));

  return (
    <>
      <button
        type="button"
        aria-label="イベント詳細を閉じる"
        className="fixed inset-0 z-[70] cursor-default bg-transparent"
        onClick={() => setState(null)}
      />
      <div
        className="fixed z-[80] max-h-[min(28rem,calc(100vh-6rem))] w-[420px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-line bg-white p-5 text-sm text-ink shadow-xl"
        style={{ left, top }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-sm bg-brand" />
              <h2 className="truncate text-lg font-bold">{event.title || event.event_type}</h2>
            </div>
            <p className="mt-1 text-sm font-semibold text-muted">{eventScheduleRangeLabel(event, timeZone)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setState(null);
                openEditTarget({ type: "event", id: event.event_id });
              }}
              className="rounded-lg px-2 py-1 text-base font-semibold hover:bg-slate-100"
            >
              編集
            </button>
            <button
              type="button"
              onClick={() => {
                saveLocalEventDelete({
                  event_id: event.event_id,
                  label: event.title || event.event_type || "予定",
                  created_at: new Date().toISOString()
                });
                setState(null);
              }}
              className="rounded-lg px-2 py-1 text-base font-semibold text-red-600 hover:bg-red-50"
            >
              削除
            </button>
            <button
              type="button"
              onClick={() => setState(null)}
              className="rounded-lg px-2 py-1 text-base font-semibold hover:bg-slate-100"
            >
              閉じる
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          <DetailRow label="企業" value={company.company_name} />
          <DetailRow label="種別" value={eventKindLabel(event.event_type)} />
          <DetailRow label="状態" value={event.status || "-"} />
          <DetailRow label="担当者" value={event.person || "-"} />
          {event.meeting_url ? (
            <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-4">
              <span className="font-semibold text-muted">URL</span>
              <a href={event.meeting_url} target="_blank" rel="noreferrer" className="break-all font-semibold text-brand hover:underline">
                {event.meeting_url}
              </a>
            </div>
          ) : null}
          <DetailRow label="メモ" value={event.memo || "-"} />
        </div>
        <div className="mt-4 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => {
              setState(null);
              window.dispatchEvent(new CustomEvent("job-hunt-note:company-karte-open", { detail: { companyId: company.company_id } }));
            }}
            className="text-sm font-semibold text-brand hover:underline"
          >
            企業詳細へ
          </button>
        </div>
      </div>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-4">
      <span className="font-semibold text-muted">{label}</span>
      <span className="whitespace-pre-wrap font-semibold text-ink">{value}</span>
    </div>
  );
}
