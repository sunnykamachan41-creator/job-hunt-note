"use client";

import { useEffect } from "react";

export function TimelineInitialScroll({ targetLeft }: { targetLeft: number }) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>("[data-timeline-scroll]");
      if (!element) return;
      element.scrollLeft = Math.max(0, targetLeft);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [targetLeft]);

  return null;
}
