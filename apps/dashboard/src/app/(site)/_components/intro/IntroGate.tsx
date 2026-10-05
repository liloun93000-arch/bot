"use client";

import { useEffect } from "react";
import "./intro.css";

/**
 * Point d'entrée React de l'introduction animée. Ne fait rien si le script de
 * démarrage n'a pas armé l'intro (déjà vue dans la session, mouvement réduit…).
 * Le moteur et les sprites (~0,5 Mo) sont chargés à la demande, seulement quand l'intro joue.
 */
export function IntroGate() {
  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains("aj-intro-on")) return;
    let dead = false;
    let handle: { stop: () => void } | undefined;
    (window as unknown as { __ajIntroStarted?: boolean }).__ajIntroStarted = true;
    void Promise.all([import("./engine"), import("./sprites.generated")])
      .then(([{ mountIntro }, { SPRITES }]) => {
        if (dead) return;
        handle = mountIntro({
          assets: SPRITES,
          mode: "fixed",
          onRevealStart: () => html.classList.remove("aj-intro-on"),
          onDone: () => html.classList.remove("aj-intro-on"),
        });
      })
      .catch(() => html.classList.remove("aj-intro-on"));
    return () => {
      dead = true;
      handle?.stop();
      html.classList.remove("aj-intro-on");
    };
  }, []);
  return null;
}
