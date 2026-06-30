"use client";

import { useEffect, useMemo, useState } from "react";

import { CompanyDraftEditSidebar, EventDraftEditSidebar } from "@/components/edit-draft-sidebars";
import type { SheetRow } from "@/lib/google-sheets";
import type { Company } from "@/types/company";
import type { JobEvent } from "@/types/event";

type EditTarget =
  | { type: "event"; id: string }
  | { type: "company"; id: string };

const editEventName = "job-hunt-note:edit";

export function openEditTarget(target: EditTarget) {
  window.dispatchEvent(new CustomEvent(editEventName, { detail: target }));
}

export function EditEntityButton({
  type,
  id,
  children = "編集",
  className = "text-sm font-semibold text-brand hover:underline"
}: {
  type: EditTarget["type"];
  id: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <button type="button" onClick={() => openEditTarget({ type, id })} className={className}>
      {children}
    </button>
  );
}

export function EditEntityActions({
  companies,
  events,
  eventTypeOptions,
  applicationSources,
  timeZone
}: {
  companies: SheetRow<Company>[];
  events: SheetRow<JobEvent>[];
  eventTypeOptions: string[];
  applicationSources: string[];
  timeZone: string;
}) {
  const [target, setTarget] = useState<EditTarget | null>(null);
  const companyById = useMemo(() => new Map(companies.map((company) => [company.company_id, company])), [companies]);
  const eventById = useMemo(() => new Map(events.map((event) => [event.event_id, event])), [events]);

  useEffect(() => {
    function onEdit(event: Event) {
      const detail = (event as CustomEvent<EditTarget>).detail;
      if (detail?.type === "event" || detail?.type === "company") {
        setTarget(detail);
      }
    }

    window.addEventListener(editEventName, onEdit);
    return () => window.removeEventListener(editEventName, onEdit);
  }, []);

  if (!target) return null;

  const event = target.type === "event" ? eventById.get(target.id) : undefined;
  const company = target.type === "company" ? companyById.get(target.id) : undefined;

  return (
    <aside className="fixed bottom-0 right-0 top-0 z-[65] hidden w-[460px] border-l border-line bg-white px-4 py-6 shadow-[-12px_0_32px_rgba(15,23,42,0.08)] lg:block">
      <div className="h-full overflow-y-auto">
        {event ? (
          <EventDraftEditSidebar
            event={event}
            events={events}
            companies={companies}
            eventTypeOptions={eventTypeOptions}
            timeZone={timeZone}
            closeHref="#"
            onClose={() => setTarget(null)}
          />
        ) : null}
        {company ? (
          <CompanyDraftEditSidebar
            company={company}
            applicationSources={applicationSources}
            closeHref="#"
            onClose={() => setTarget(null)}
          />
        ) : null}
      </div>
    </aside>
  );
}
