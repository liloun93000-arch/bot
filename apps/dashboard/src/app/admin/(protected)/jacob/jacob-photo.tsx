"use client";

import { useState } from "react";
import { Icon } from "../icons";

/** Photo du client dans une demande : miniature visible, clic = plein écran. */
export function JacobPhoto({ file, nom }: { file: string; nom: string }) {
  const [open, setOpen] = useState(false);
  const src = `/api/media/${encodeURIComponent(file)}`;
  return (
    <>
      <button type="button" className="aj-req-photo" onClick={() => setOpen(true)} aria-label={`Agrandir la photo de ${nom}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Photo de ${nom}`} loading="lazy" />
      </button>
      {open && (
        <div className="aj-lightbox" role="dialog" aria-modal="true" aria-label="Photo en grand">
          <div className="flex items-center justify-between gap-3 p-3 text-white">
            <div className="truncate text-sm font-semibold">{nom}</div>
            <button type="button" aria-label="Fermer" className="aj-iconbtn" onClick={() => setOpen(false)}>
              <Icon name="close" />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Photo de ${nom}`} className="max-h-full max-w-full rounded-xl object-contain" />
          </div>
        </div>
      )}
    </>
  );
}
