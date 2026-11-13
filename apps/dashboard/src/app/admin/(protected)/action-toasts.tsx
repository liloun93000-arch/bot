"use client";

import { useEffect, useState } from "react";

/**
 * Petites notifications pour TOUTES les actions du dashboard (Marquer traité, Rendre la main au bot,
 * Envoyer, Enregistrer…) : « ⏳ En cours… » pendant l'action, puis « ✅ … » quand c'est fait
 * (ou « ❌ » si ça a échoué). Repère les actions serveur Next (en-tête Next-Action) sans toucher
 * à chaque bouton.
 */
type Toast = { id: number; kind: "load" | "ok" | "err"; text: string };

function messageOk(label: string): string {
  const l = label.toLowerCase();
  if (/trait/.test(l)) return "✅ C'est bon, passé en traité";
  if (/rendre|main au bot|réactiv|reactiv/.test(l)) return "✅ C'est bon, la main a été rendue au bot";
  if (/reprendre/.test(l)) return "✅ C'est bon, tu as repris la conversation";
  if (/envoy|relance|répond|repond/.test(l)) return "✅ C'est bon, message envoyé";
  if (/supprim|retir/.test(l)) return "✅ C'est bon, supprimé";
  if (/enregistr|sauv|valid|ajout|créer|creer/.test(l)) return "✅ C'est bon, enregistré";
  return "✅ C'est bon, c'est fait";
}

export function ActionToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let lastLabel = "";
    const onSubmit = (e: SubmitEvent) => {
      const btn = e.submitter as HTMLElement | null;
      lastLabel = (btn?.innerText || btn?.getAttribute("aria-label") || btn?.getAttribute("title") || "").trim();
    };
    document.addEventListener("submit", onSubmit, true);

    const original = window.fetch;
    let seq = 0;
    const push = (t: Toast) => setToasts((all) => [...all.filter((x) => x.id !== t.id), t]);
    const drop = (id: number, ms: number) => setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), ms);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!h.has("next-action")) return original(input, init);
      const id = ++seq;
      const label = lastLabel;
      lastLabel = "";
      push({ id, kind: "load", text: "⏳ En cours…" });
      try {
        const res = await original(input, init);
        if (res.ok || res.status === 303) push({ id, kind: "ok", text: messageOk(label) });
        else push({ id, kind: "err", text: "❌ Ça n'a pas marché, réessaie" });
        drop(id, 2600);
        return res;
      } catch (err) {
        push({ id, kind: "err", text: "❌ Ça n'a pas marché, vérifie ta connexion" });
        drop(id, 3500);
        throw err;
      }
    };
    return () => {
      window.fetch = original;
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="aj-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`aj-toast is-${t.kind}`}>
          {t.kind === "load" && <span className="aj-toast-spin" aria-hidden />}
          {t.text}
        </div>
      ))}
    </div>
  );
}
