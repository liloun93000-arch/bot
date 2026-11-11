"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Retour qui respecte le contexte d'ouverture : Conversations avec son filtre / sa recherche,
 * ou l'onglet Jacob. L'origine arrive dans `?from=` à l'ouverture et reste mémorisée pour cette
 * conversation (les envois de message rechargent la page sans le paramètre).
 */
export function BackLink({ waId, from, fallback = "/admin/conversations" }: { waId: string; from?: string; fallback?: string }) {
  const router = useRouter();
  const key = `aj-back:${waId}`;
  useEffect(() => {
    if (from && from.startsWith("/admin")) {
      try {
        sessionStorage.setItem(key, from);
      } catch {
        /* ignoré */
      }
    }
  }, [from, key]);

  function target(): string {
    if (from && from.startsWith("/admin")) return from;
    try {
      return sessionStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  }

  const label = (from ?? "").startsWith("/admin/jacob") ? "← Demandes de Jacob" : "← Retour";
  return (
    <a
      href={from && from.startsWith("/admin") ? from : fallback}
      className="text-sm text-neutral-500 hover:underline"
      onClick={(e) => {
        e.preventDefault();
        router.push(target());
      }}
    >
      {label}
    </a>
  );
}

/**
 * Mémorise la position de défilement d'une liste (Conversations, Jacob) et la restaure au retour.
 */
export function ScrollMemory({ id }: { id: string }) {
  useEffect(() => {
    const key = `aj-scroll:${id}`;
    try {
      const y = Number(sessionStorage.getItem(key) || 0);
      if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
    } catch {
      /* ignoré */
    }
    const save = () => {
      try {
        sessionStorage.setItem(key, String(window.scrollY));
      } catch {
        /* ignoré */
      }
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      save();
      window.removeEventListener("scroll", save);
    };
  }, [id]);
  return null;
}
