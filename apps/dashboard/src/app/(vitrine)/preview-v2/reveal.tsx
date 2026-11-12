"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Apparition douce des sections au défilement (désactivée si l'utilisateur réduit les animations). */
export function Reveal() {
  const path = usePathname();
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".v2 [data-reveal]:not(.is-in)");
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach((e) => e.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-in");
            io.unobserve(en.target);
          }
        }),
      { rootMargin: "0px 0px 0px 0px", threshold: 0 },
    );
    els.forEach((e) => io.observe(e));
    // Filet de sécurité : rien ne doit rester invisible (pas de « trou »).
    const t = window.setTimeout(() => els.forEach((e) => e.classList.add("is-in")), 1500);
    return () => {
      io.disconnect();
      window.clearTimeout(t);
    };
  }, [path]);
  return null;
}
