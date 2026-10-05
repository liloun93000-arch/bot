"use client";

import { useEffect, useState } from "react";

/**
 * Coque de navigation : barre latérale fixe sur grand écran, menu hamburger
 * sur mobile.
 *
 * Comportement du menu mobile (exigence) : une fois OUVERT, il reste ouvert et
 * stable. Il ne se ferme PAS au défilement, au balayage, à un mouvement
 * rapide du doigt ni à un clic accidentel sur le fond. Il ne se ferme que :
 *  - avec le bouton ✕ ;
 *  - quand on choisit un élément du menu (lien).
 * Pendant l'ouverture, la page derrière est verrouillée (pas de défilement
 * « fantôme ») et le menu garde son propre défilement sans le propager.
 */
export function NavShell({
  brand,
  children,
  footer,
}: {
  brand: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-3 text-neutral-100 md:hidden">
        {brand}
        <button
          type="button"
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="rounded-lg border border-neutral-700 px-3 py-2 text-lg leading-none"
        >
          ☰
        </button>
      </header>

      {/* Fond : purement visuel. Aucun gestionnaire de clic : un appui accidentel ne ferme rien. */}
      {open && <div aria-hidden className="fixed inset-0 z-40 bg-black/60 md:hidden" />}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col overscroll-contain bg-neutral-900 text-neutral-100 shadow-2xl transition-transform duration-200 md:static md:z-auto md:min-h-screen md:w-60 md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-none ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        // Sélectionner un élément du menu referme (autorisé) ; rien d'autre.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        <div className="flex items-center justify-between px-4 py-4">
          {brand}
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-lg leading-none md:hidden"
          >
            ✕
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 pb-2">{children}</nav>
        <div className="mt-auto flex items-center justify-between px-4 py-4 text-sm text-neutral-400">{footer}</div>
      </aside>
    </>
  );
}
