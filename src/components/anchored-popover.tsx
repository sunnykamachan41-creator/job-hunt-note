"use client";

import { useEffect, useState } from "react";

type Position = {
  left: number;
  top: number;
};

export function AnchoredPopover({
  anchorId,
  width = 420,
  children
}: {
  anchorId: string;
  width?: number;
  children: React.ReactNode;
}) {
  const [position, setPosition] = useState<Position | null>(null);

  useEffect(() => {
    function updatePosition() {
      const anchor = document.querySelector<HTMLElement>(`[data-timeline-event-id="${CSS.escape(anchorId)}"]`);

      if (!anchor) {
        setPosition({
          left: Math.max(16, (window.innerWidth - width) / 2),
          top: 96
        });
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const margin = 16;
      const popoverHeight = Math.min(440, window.innerHeight - margin * 2);
      const spaceRight = window.innerWidth - rect.right - margin;
      const spaceLeft = rect.left - margin;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;

      let left = rect.right + 12;
      let top = rect.top - 8;

      if (spaceRight < width && spaceLeft >= width) {
        left = rect.left - width - 12;
      } else if (spaceRight < width && spaceLeft < width) {
        left = rect.left;
      }

      if (spaceBelow < popoverHeight * 0.55 && spaceAbove > spaceBelow) {
        top = rect.bottom - popoverHeight + 8;
      }

      left = clamp(left, margin, window.innerWidth - width - margin);
      top = clamp(top, margin, window.innerHeight - popoverHeight - margin);

      setPosition({ left, top });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorId, width]);

  if (!position) return null;

  return (
    <div
      className="fixed z-[90]"
      style={{
        left: position.left,
        top: position.top,
        width
      }}
    >
      {children}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
