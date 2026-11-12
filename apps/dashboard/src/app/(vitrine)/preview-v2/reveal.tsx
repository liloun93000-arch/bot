"use client";

import { useEffect } from "react";

/** Apparition douce des sections au défilement (désactivée si l'utilisateur réduit les animations). */
export function Reveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".v2 [data-reveal]");
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
      { rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return null;
}
