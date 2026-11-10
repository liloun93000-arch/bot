"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Portal } from "./portal";
import { Icon, idx } from "./icons";

/** Chiffre qui monte doucement de 0 à sa valeur (désactivé si « mouvement réduit »). */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [n, setN] = useState(value);

  useEffect(() => {
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || value <= 0) {
      setN(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setN(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{n.toLocaleString("fr-FR")}</>;
}

export interface PhotoItem {
  file: string;
  nom: string;
  waId: string;
  quand: string;
}

/** Miniatures cliquables + visionneuse plein écran (précédent / suivant / fermer). */
export function PhotoGallery({ photos, variant }: { photos: PhotoItem[]; variant: "strip" | "grid" }) {
  const [index, setIndex] = useState<number | null>(null);
  const open = index !== null;

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIndex(null);
      if (e.key === "ArrowRight") setIndex((i) => (i === null ? i : Math.min(photos.length - 1, i + 1)));
      if (e.key === "ArrowLeft") setIndex((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, photos.length]);

  const current = index !== null ? photos[index] : undefined;

  return (
    <>
      <div className={variant === "strip" ? "aj-photos" : "aj-mediagrid"}>
        {photos.map((p, i) => (
          <button
            key={`${p.file}-${i}`}
            type="button"
            className="aj-photo aj-rise"
            style={idx(Math.min(i, 8))}
            aria-label={`Ouvrir la photo de ${p.nom}`}
            onClick={() => setIndex(i)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/media/${encodeURIComponent(p.file)}`} alt={`Photo de ${p.nom}`} loading="lazy" />
          </button>
        ))}
      </div>

      {current && index !== null && (
        <Portal onClose={() => setIndex(null)}>
        <div className="aj-lightbox" role="dialog" aria-modal="true" aria-label="Photo en grand">
          <div className="flex items-center justify-between gap-3 p-3 text-white">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{current.nom}</div>
              <div className="text-xs" style={{ color: "var(--aj-gray)" }}>
                {current.quand} · {index + 1}/{photos.length}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/admin/conversations/${current.waId}`} className="btn btn-secondary">
                Conversation
              </Link>
              <button type="button" aria-label="Fermer" className="aj-iconbtn" onClick={() => setIndex(null)}>
                <Icon name="close" />
              </button>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/media/${encodeURIComponent(current.file)}`}
              alt={`Photo de ${current.nom}`}
              className="max-h-full max-w-full rounded-xl object-contain"
            />
            {index > 0 && (
              <button
                type="button"
                aria-label="Photo précédente"
                className="aj-iconbtn absolute left-2 top-1/2 -translate-y-1/2"
                onClick={() => setIndex(index - 1)}
              >
                <Icon name="chevron" className="rotate-180" />
              </button>
            )}
            {index < photos.length - 1 && (
              <button
                type="button"
                aria-label="Photo suivante"
                className="aj-iconbtn absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setIndex(index + 1)}
              >
                <Icon name="chevron" />
              </button>
            )}
          </div>
        </div>
        </Portal>
      )}
    </>
  );
}
