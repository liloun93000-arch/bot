"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Met les coches à jour toutes seules tant qu'un message récent n'a pas atteint
 * son état final (lu ou échec). N'agit que si l'onglet est visible et ne touche
 * pas au champ de réponse : `router.refresh()` conserve l'état du navigateur.
 */
export function DeliveryAutoRefresh({ active, everyMs = 8000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => window.clearInterval(id);
  }, [active, everyMs, router]);
  return null;
}
