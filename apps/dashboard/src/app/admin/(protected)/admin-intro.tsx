"use client";

import { useEffect } from "react";
import "@/app/(site)/_components/intro/intro.css";
import { canRun3D } from "@/app/(site)/_components/intro/can3d";

/** Posé par la page de connexion au clic sur « Se connecter » : l'intro se joue une fois, juste après. */
export const INTRO_PENDING_KEY = "aj-intro-pending";

/**
 * Introduction Jacob & Lilou, jouée PAR-DESSUS le vrai dashboard (déjà rendu dessous) juste après la connexion.
 * - Aucun effet si on n'arrive pas depuis « Se connecter » (navigation normale, rechargement).
 * - Appareil trop faible / WebGL absent / « mouvement réduit » : le dashboard est simplement utilisable tout de suite.
 * - ?intro3d=1 force la 3D (tests), ?intro3d=0 la désactive.
 * Le moteur (three.js + modèles) est préchargé pendant la saisie des identifiants (voir la page de connexion).
 */
export function AdminIntro() {
  useEffect(() => {
    let pending = false;
    try {
      pending = sessionStorage.getItem(INTRO_PENDING_KEY) === "1";
    } catch {
      /* stockage indisponible : pas d'intro */
    }
    if (!pending) return;
    const q = new URLSearchParams(location.search).get("intro3d");
    if (q === "0") {
      try {
        sessionStorage.removeItem(INTRO_PENDING_KEY);
      } catch {
        /* ignoré */
      }
      return;
    }
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if ((reduced || !canRun3D()) && q !== "1") {
      try {
        sessionStorage.removeItem(INTRO_PENDING_KEY);
      } catch {
        /* ignoré */
      }
      return;
    }
    let dead = false;
    let handle: { stop: () => void } | undefined;
    void import("@/app/(site)/_components/intro/engine3d")
      .then(async ({ mountIntro3D }) => {
        if (dead) return;
        handle = await mountIntro3D({ mode: "fixed", force: q === "1" });
        try {
          sessionStorage.removeItem(INTRO_PENDING_KEY);
        } catch {
          /* ignoré */
        }
        if (dead) handle.stop();
      })
      .catch(() => {
        // Trop lent / erreur : on laisse simplement le dashboard, déjà prêt.
        try {
          sessionStorage.removeItem(INTRO_PENDING_KEY);
        } catch {
          /* ignoré */
        }
      });
    return () => {
      dead = true;
      handle?.stop();
    };
  }, []);
  return null;
}
