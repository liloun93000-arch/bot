"use client";

import { useEffect, useState } from "react";
import { logoutAction } from "@/lib/actions";

/**
 * Oblige à se reconnecter à chaque nouvel onglet / après fermeture de l'onglet :
 * sessionStorage est propre à l'onglet et disparaît quand on le ferme. Sans le repère
 * posé à la connexion, on déconnecte et on renvoie vers la page de connexion.
 * Un écran noir masque le contenu pendant cette vérification.
 */
export function TabGuard() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let allowed = false;
    try {
      allowed = sessionStorage.getItem("aj-tab-ok") === "1";
    } catch {
      allowed = false;
    }
    if (allowed) setOk(true);
    else void logoutAction();
  }, []);
  if (ok) return null;
  return <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#070708" }} aria-hidden />;
}
