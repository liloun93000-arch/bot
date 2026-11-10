"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fil WhatsApp : s'ouvre directement sur les DERNIERS messages (en bas). On remonte soi-même
 * si on veut l'historique. Reste collé en bas pendant que les photos se chargent, tant qu'on
 * n'a pas remonté le fil.
 */
export function ChatScroll({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const toBottom = () => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    };
    toBottom();
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(toBottom);
    for (const child of Array.from(el.children)) ro.observe(child);
    ro.observe(el);
    // Les images qui finissent de charger agrandissent le fil : on reste en bas.
    el.addEventListener("load", toBottom, true);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("load", toBottom, true);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
