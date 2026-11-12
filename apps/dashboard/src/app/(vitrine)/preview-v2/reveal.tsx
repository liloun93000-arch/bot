"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Apparition douce des sections au défilement (désactivée si l'utilisateur réduit les animations). */
export function Reveal() {
  const path = usePathname();
  // Barre du haut qui s'opacifie au défilement + parallaxe très légère du hero (une seule écoute, rAF).
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".v2");
    root?.classList.add("js-on");
    const head = document.querySelector<HTMLElement>(".v2-head");
    const calme = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const y = window.scrollY;
      head?.classList.toggle("is-scrolled", y > 12);
      if (!calme && root && y < 1200) root.style.setProperty("--sy", String(y));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

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
