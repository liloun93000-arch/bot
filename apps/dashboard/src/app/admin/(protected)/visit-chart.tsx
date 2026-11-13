"use client";

import { useRef, useState } from "react";

type T = { label: string; visiteurs: number; pages: number };

/** Visites par heure / par jour : glisser le doigt pour lire chaque tranche. */
export function VisitChart({ tranches }: { tranches: T[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<number | null>(tranches.length ? tranches.length - 1 : null);
  const max = Math.max(1, ...tranches.map((t) => t.visiteurs));
  const pick = (x: number) => {
    const el = ref.current;
    if (!el || !tranches.length) return;
    const r = el.getBoundingClientRect();
    const px = Math.min(Math.max(x - r.left + el.scrollLeft, 0), el.scrollWidth - 1);
    setSel(Math.min(tranches.length - 1, Math.floor((px / el.scrollWidth) * tranches.length)));
  };
  const t = sel !== null ? tranches[sel] : undefined;
  return (
    <div className="aj-kchart">
      <div className="aj-kchart-info">
        {t ? (
          <>
            <span>{t.label}</span>
            <b>
              {t.visiteurs} visiteur{t.visiteurs > 1 ? "s" : ""} · {t.pages} page{t.pages > 1 ? "s" : ""}
            </b>
          </>
        ) : (
          <span>Aucune donnée</span>
        )}
      </div>
      <div ref={ref} className="aj-kimi-chart aj-kchart-zone" onPointerDown={(e) => pick(e.clientX)} onPointerMove={(e) => pick(e.clientX)} onTouchMove={(e) => e.touches[0] && pick(e.touches[0].clientX)}>
        {tranches.map((x, i) => (
          <div key={i} className={`aj-kimi-col${i === sel ? " is-sel" : ""}`}>
            <div className="aj-kimi-bar" style={{ height: `${(x.visiteurs / max) * 100}%` }} />
            <span>{x.label.replace(" h", "")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
