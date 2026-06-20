"use client";

type EditTarget =
  | { type: "event"; id: string }
  | { type: "company"; id: string };

export function openEditTarget(target: EditTarget) {
  window.dispatchEvent(new CustomEvent("job-hunt-note:edit", { detail: target }));
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
