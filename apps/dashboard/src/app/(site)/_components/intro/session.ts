/** Logique de session : l'intro ne se joue qu'une fois à l'entrée sur le site. */
import { SESSION_KEY } from "./config";

export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function hasSeenIntro(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) !== null;
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* stockage indisponible (navigation privée…) : l'intro peut se rejouer, sans conséquence */
  }
}

export function resetIntroSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Script inline exécuté AVANT le premier affichage : pose `aj-intro-on` sur <html>
 * (voile noir immédiat, pas de flash du site) uniquement si l'intro doit se jouer.
 * Filet de sécurité : si le moteur n'a pas démarré après 7 s, le voile est retiré.
 * `?intro=1` force la lecture, `?intro=0` la désactive.
 */
export const INTRO_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,q=location.search,K='${SESSION_KEY}';var force=/[?&]intro=1(&|$)/.test(q),off=/[?&]intro=0(&|$)/.test(q);var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;if(off)return;if(!force&&rm){sessionStorage.setItem(K,'1');return}if(!force&&sessionStorage.getItem(K))return;d.classList.add('aj-intro-on');setTimeout(function(){if(!window.__ajIntroStarted)d.classList.remove('aj-intro-on')},7000)}catch(e){}})();`;
