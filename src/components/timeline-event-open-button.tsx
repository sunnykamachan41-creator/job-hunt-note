"use client";

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
