"use client";

import { useEffect, useState } from "react";

/**
 * Média d'une conversation. Architecture par type : l'image est complète
 * (miniature + chargeur + plein écran + repli) ; audio / vidéo / document
 * ont déjà leur rendu simple et se complètent en ajoutant un cas à `Renderer`.
 */
export function ChatMedia({ file, mime, alt }: { file: string; mime: string; alt: string }) {
  const src = `/api/media/${file}`;
  if (mime.startsWith("image/")) return <ChatImage src={src} alt={alt} />;
  if (mime.startsWith("audio/")) return <audio controls preload="none" src={src} className="w-full max-w-xs" />;
  if (mime.startsWith("video/"))
    return <video controls preload="none" src={src} className="max-h-64 rounded-lg border border-neutral-200" />;
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline">
      📎 Ouvrir le fichier reçu
    </a>
  );
}

function ChatImage({ src, alt }: { src: string; alt: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Plein écran : Échap ferme, la page derrière ne défile plus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (state === "error") {
    return (
      <div className="flex max-w-xs flex-col items-start gap-1 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-500">
        <span>🖼️ Photo indisponible (fichier introuvable ou en cours de chargement).</span>
        <button
          type="button"
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-neutral-700"
          onClick={() => {
            setState("loading");
            setAttempt((n) => n + 1);
          }}
        >
          ↻ Réessayer
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => state === "ok" && setOpen(true)}
        aria-label="Agrandir la photo"
        className="relative block overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100"
        style={{ minWidth: state === "ok" ? undefined : 160, minHeight: state === "ok" ? undefined : 120 }}
      >
        {state === "loading" && (
          <span className="absolute inset-0 flex animate-pulse items-center justify-center text-xs text-neutral-400">
            Chargement…
          </span>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={attempt}
          src={`${src}${attempt ? `?r=${attempt}` : ""}`}
          alt={alt}
          loading="lazy"
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
          className={`max-h-64 max-w-full object-contain transition-opacity ${state === "ok" ? "opacity-100" : "opacity-0"}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo en grand"
          className="fixed inset-0 z-[100] flex flex-col bg-black/95"
          onClick={() => setOpen(false)}
        >
          <div className="flex items-center justify-between p-3 text-white" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-white/15 px-3 py-2 text-sm">
              ← Retour à la conversation
            </button>
            <div className="flex gap-2">
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-white/15 px-3 py-2 text-sm"
                onClick={(e) => e.stopPropagation()}
              >
                ⤢ Original
              </a>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-white/15 px-3 py-2 text-sm"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </>
  );
}
