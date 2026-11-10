"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Affiche son contenu directement dans <body>, au-dessus de TOUT (barre du haut, menu, barre du bas).
 * Sans ça, une photo en plein écran ouverte dans une carte animée restait coincée sous la barre du
 * haut : la croix de fermeture était cachée. Bloque aussi le défilement de la page derrière.
 */
export function Portal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(document.body);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return el ? createPortal(children, el) : null;
}
