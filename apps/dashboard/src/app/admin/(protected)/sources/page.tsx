import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { siteBaseUrl } from "@/lib/site/server";
import { addSourceAction, toggleSourceAction } from "@/lib/tracking-actions";
import { WA_DESTINATION, clicksBySource, listSources, totalClicks } from "@/lib/tracking";
import { CopyLink } from "./copy-link";

export const dynamic = "force-dynamic";

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requireSession();
  const { msg } = await searchParams;
  const { core } = getRuntime();
  const base = siteBaseUrl().origin;
  const sources = listSources(core);
  const week = clicksBySource(core, Date.now() - 7 * 86_400_000, Date.now() + 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Liens de suivi</h1>
        <p className="text-sm text-neutral-500">
          Un lien par plateforme. Le client clique, WhatsApp s&apos;ouvre aussitôt sur +{WA_DESTINATION}, sans aucun message
          prérempli : il écrit ce qu&apos;il veut. Nous, on compte le clic.
        </p>
      </div>
      {msg && <div className="card text-sm font-medium">{msg}</div>}

      <div className="card text-sm">
        <b>Ce qu&apos;on mesure, honnêtement :</b> des <b>clics par source</b>. Avec un lien WhatsApp sans texte prérempli,
        WhatsApp ne transmet aucune information sur l&apos;origine quand le client écrit : il est donc impossible de savoir de
        façon fiable de quelle plateforme vient CHAQUE client. Aucune source n&apos;est attribuée à un client — on ne devine
        jamais. Les aperçus automatiques de liens (robots Snapchat, Telegram, WhatsApp…) ne sont pas comptés.
      </div>

      <div className="aj-src-list">
        {sources.map((s) => {
          const lien = `${base}/go/${s.slug}`;
          return (
            <article key={s.id} className={`card aj-src${s.actif ? "" : " is-off"}`}>
              <div className="aj-src-top">
                <h2>{s.nom}</h2>
                <span className={`badge ${s.actif ? "badge-bot" : "badge-neutre"}`}>{s.actif ? "actif" : "inactif"}</span>
              </div>
              <CopyLink value={lien} />
              <p className="aj-src-meta">
                Destination : WhatsApp +{WA_DESTINATION} (sans message) · <b>{week.get(s.id) ?? 0}</b> clic(s) sur 7 jours ·{" "}
                <b>{totalClicks(core, s.id)}</b> au total
              </p>
              <form action={toggleSourceAction.bind(null, s.id)}>
                <button type="submit" className="btn btn-secondary">
                  {s.actif ? "Désactiver le comptage" : "Réactiver"}
                </button>
              </form>
            </article>
          );
        })}
      </div>

      <form action={addSourceAction} className="card space-y-2">
        <h2 className="font-semibold">Ajouter une source</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input name="nom" required className="input" placeholder="Nom (ex. TikTok)" />
          <input name="slug" className="input" placeholder="Lien court (facultatif, ex. tiktok)" />
        </div>
        <button className="btn btn-primary" type="submit">
          Ajouter
        </button>
      </form>
    </div>
  );
}
