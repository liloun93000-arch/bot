"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type T = { label: string; visiteurs: number; pages: number; detail?: string };

const H = 190;
const PAD = { top: 8, right: 6, bottom: 24, left: 6 };

/**
 * Visites par heure / par jour. Dessiné en SVG avec des dimensions calculées en pixels (aucun pourcentage de
 * hauteur CSS, source d'erreurs d'affichage sur mobile). Toucher ou glisser le doigt pour lire chaque tranche ;
 * le nombre de dates affichées s'adapte à la largeur disponible.
 */
export function VisitChart({ tranches, mode = "visites" }: { tranches: T[]; mode?: "visites" | "clics" }) {
  const clics = mode === "clics";
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [sel, setSel] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(200, Math.floor(el.getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = tranches.length;
  const maxPages = Math.max(1, ...tranches.map((t) => t.pages));
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = n > 0 ? plotW / n : plotW;
  const barW = Math.max(2, Math.min(28, slot * 0.72));

  // Sans sélection, on met en avant la dernière tranche qui contient des visites (sinon la dernière).
  const defaultSel = useMemo(() => {
    for (let i = n - 1; i >= 0; i--) if ((tranches[i]?.pages ?? 0) > 0) return i;
    return n > 0 ? n - 1 : null;
  }, [tranches, n]);
  const active = touched ? sel : defaultSel;

  // ~44 px par étiquette : le nombre de dates suit la largeur de l'écran ; la dernière tranche est toujours étiquetée.
  const maxLabels = Math.max(2, Math.floor(plotW / 44));
  const step = Math.max(1, Math.ceil(n / maxLabels));
  const showLabel = (i: number) => (n - 1 - i) % step === 0;

  const pick = (clientX: number) => {
    const el = wrap.current;
    if (!el || n === 0) return;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left - PAD.left;
    setSel(Math.min(n - 1, Math.max(0, Math.floor(x / slot))));
    setTouched(true);
  };

  const t = active !== null ? tranches[active] : undefined;
  const total = tranches.reduce((a, x) => a + x.pages, 0);

  return (
    <div className="aj-kchart">
      <div className="aj-kchart-info" aria-live="polite">
        {t ? (
          <>
            <span>{t.detail ?? t.label}</span>
            <b>
              {clics
                ? `${t.pages} clic${t.pages > 1 ? "s" : ""}`
                : `${t.visiteurs} visiteur${t.visiteurs > 1 ? "s" : ""} · ${t.pages} page${t.pages > 1 ? "s" : ""} vue${t.pages > 1 ? "s" : ""}`}
            </b>
          </>
        ) : (
          <span>Aucune donnée</span>
        )}
      </div>
      <div ref={wrap} style={{ width: "100%", touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none" }}>
        <svg
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          aria-label={clics ? `Clics par ${n > 26 ? "jour" : "tranche"} (${total} au total)` : `Visiteurs et pages vues par ${n > 26 ? "jour" : "tranche"} (${total} pages vues au total)`}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerMove={(e) => (e.pointerType === "mouse" ? e.buttons === 1 || pick(e.clientX) : pick(e.clientX))}
          style={{ display: "block", cursor: "crosshair" }}
        >
          <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="#ffffff22" />
          {tranches.map((x, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const hp = (x.pages / maxPages) * plotH;
            const hv = (x.visiteurs / maxPages) * plotH;
            const on = i === active;
            return (
              <g key={i}>
                {on && <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotH} fill="#ffffff0d" />}
                <rect x={cx - barW / 2} y={PAD.top + plotH - hp} width={barW} height={Math.max(x.pages > 0 ? 2 : 0, hp)} rx={2} fill={clics ? (on ? "#f0142f" : "#3b6cf0") : on ? "#f0142f66" : "#3b6cf055"} />
                {!clics && <rect x={cx - barW / 2} y={PAD.top + plotH - hv} width={barW} height={Math.max(x.visiteurs > 0 ? 2 : 0, hv)} rx={2} fill={on ? "#f0142f" : "#3b6cf0"} />}
                {showLabel(i) && (
                  <text x={cx} y={H - 7} textAnchor="middle" fontSize={10} fill={on ? "#ffffff" : "#8b909b"} fontWeight={on ? 700 : 400}>
                    {x.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="aj-kchart-legend">
        {clics ? (
          <span><i style={{ background: "#3b6cf0" }} /> Clics</span>
        ) : (
          <>
            <span><i style={{ background: "#3b6cf0" }} /> Visiteurs uniques</span>
            <span><i style={{ background: "#3b6cf055" }} /> Pages vues</span>
          </>
        )}
      </div>
    </div>
  );
}
