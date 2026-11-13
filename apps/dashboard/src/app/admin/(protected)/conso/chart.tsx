"use client";

import { useRef, useState } from "react";

type Barre = { label: string; usd: number; estime: boolean };

const usd = (n: number): string => `$ ${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Graphique où l'on glisse le doigt (ou la souris) : le montant de la barre touchée s'affiche. */
export function KimiChart({ barres, unite }: { barres: Barre[]; unite: "jour" | "heure" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<number | null>(barres.length ? barres.length - 1 : null);
  const max = Math.max(0.01, ...barres.map((b) => b.usd));

  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el || barres.length === 0) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - r.left + el.scrollLeft, 0), el.scrollWidth - 1);
    setSel(Math.min(barres.length - 1, Math.floor((x / el.scrollWidth) * barres.length)));
  };

  const b = sel !== null ? barres[sel] : undefined;
  return (
    <div className="aj-kchart">
      <div className="aj-kchart-info" aria-live="polite">
        {b ? (
          <>
            <span>{b.label}</span>
            <b>
              {b.estime ? "≈ " : ""}
              {usd(b.usd)}
            </b>
          </>
        ) : (
          <span>Glisse le doigt sur le graphique</span>
        )}
      </div>
      <div
        ref={ref}
        className="aj-kimi-chart aj-kchart-zone"
        onPointerDown={(e) => {
          (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => pick(e.clientX)}
        onTouchMove={(e) => e.touches[0] && pick(e.touches[0].clientX)}
      >
        {barres.map((x, i) => (
          <div key={i} className={`aj-kimi-col${i === sel ? " is-sel" : ""}`}>
            <div className={`aj-kimi-bar${x.estime ? " is-est" : ""}`} style={{ height: `${(x.usd / max) * 100}%` }} />
            <span>{x.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
