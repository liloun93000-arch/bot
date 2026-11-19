"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";

/**
 * Bouton d'action « instantané » : l'écran réagit tout de suite (bouton validé, ou carte retirée de la liste),
 * pendant que l'action serveur s'exécute en arrière-plan. Si elle échoue, l'écran revient à l'état d'avant.
 * L'état réel reste celui du serveur : la page se rafraîchit seule à la fin de l'action.
 */
export function InstantForm({
  action,
  className = "btn btn-secondary",
  doneLabel,
  hideClosest,
  children,
}: {
  action: () => Promise<void>;
  className?: string;
  /** Texte affiché aussitôt après le clic. */
  doneLabel: string;
  /** Sélecteur de l'élément parent à masquer aussitôt (ex. la carte d'une demande traitée). */
  hideClosest?: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<"idle" | "done" | "err">("idle");
  const [, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  const hide = (on: boolean) => {
    const el = hideClosest ? form.current?.closest<HTMLElement>(hideClosest) : null;
    if (el) el.style.display = on ? "none" : "";
  };

  return (
    <form
      ref={form}
      onSubmit={(e) => {
        e.preventDefault();
        if (state === "done") return;
        setState("done");
        hide(true);
        start(async () => {
          try {
            await action();
          } catch {
            setState("err");
            hide(false);
          }
        });
      }}
    >
      <button className={className} type="submit" disabled={state === "done"} aria-live="polite">
        {state === "done" ? doneLabel : state === "err" ? "↻ Réessayer" : children}
      </button>
    </form>
  );
}
