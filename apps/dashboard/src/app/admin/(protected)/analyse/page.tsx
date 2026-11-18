import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { generateAiIdeasAction } from "@/lib/actions";
import { analyze, resolvePeriod, type Exemple, type Insight } from "@arbi/core";

export const dynamic = "force-dynamic";

const PRESETS: Array<[string, string]> = [["today", "Aujourd'hui"], ["yesterday", "Hier"], ["7d", "7 jours"], ["30d", "30 jours"]];
const CAT_LABEL: Record<string, string> = {
  contenu: "Contenu", offre: "Offre", discours: "Discours commercial", conversion: "Conversion",
  fournisseur: "Fournisseur", formation: "Formation", promo: "Promotion",
};
const hour = (ts: number) => new Date(ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

function Exemples({ items, from }: { items: Exemple[]; from: string }) {
  if (items.length === 0) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-slate-500">Voir les conversations ({items.length}) — réservé aux administrateurs</summary>
      <ul className="mt-1 space-y-1 text-sm">
        {items.map((e) => (
          <li key={e.waId}>
            <Link href={`/admin/conversations/${e.waId}?from=${encodeURIComponent(from)}`} className="underline">{e.nom || `+${e.waId}`}</Link>{" "}
            <span className="text-xs text-slate-500">{hour(e.ts)}</span> — « {e.extrait} »
          </li>
        ))}
      </ul>
    </details>
  );
}

function Block({ titre, items, vide, from }: { titre: string; items: Insight[]; vide: string; from: string }) {
  return (
    <div className="card p-3">
      <b>{titre}</b>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500 mt-1">{vide}</p>
      ) : (
        <ul className="mt-1 space-y-2">
          {items.slice(0, 8).map((i) => (
            <li key={i.id}>
              <span className="font-medium">{i.label}</span> — {i.nbClients} client{i.nbClients > 1 ? "s" : ""}
              <Exemples items={i.exemples} from={from} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function AnalysePage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  await requireSession();
  const { p = "7d", from = "", to = "" } = await searchParams;
  const { core } = getRuntime();
  const period = resolvePeriod(p, from, to);
  const a = analyze(core, period);
  const here = `/admin/analyse?p=${period.preset}${period.preset === "custom" ? `&from=${from}&to=${to}` : ""}`;
  const ideas = core.settings.get("analyse_ia_idees");
  const ideasKey = `${period.preset}|${period.preset === "custom" ? from : ""}|${period.preset === "custom" ? to : ""}`;

  return (
    <div className="space-y-4">
      <div className="aj-lead-hero">
        <h1>📈 Analyse &amp; Suggestions IA</h1>
        <p>
          Tout est calculé à partir des vraies conversations de la période : aucun chiffre ni motif inventé. Les suggestions ne modifient
          <b> jamais</b> ton catalogue ni tes tarifs — tu décides. Les conversations justificatives ne sont visibles que dans l&apos;administration.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {PRESETS.map(([k, label]) => (
          <Link key={k} href={`/admin/analyse?p=${k}`} className={`btn ${period.preset === k ? "btn-primary" : ""}`}>{label}</Link>
        ))}
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="p" value="custom" />
          <label className="text-xs">Du<input type="date" name="from" defaultValue={from} className="input" /></label>
          <label className="text-xs">Au<input type="date" name="to" defaultValue={to} className="input" /></label>
          <button className={`btn ${period.preset === "custom" ? "btn-primary" : ""}`}>Période personnalisée</button>
        </form>
      </div>

      <div className="card p-3 text-sm">
        <b>{period.label}</b> — {a.clientsActifs} client{a.clientsActifs > 1 ? "s" : ""} actif{a.clientsActifs > 1 ? "s" : ""}, {a.messagesClients} message{a.messagesClients > 1 ? "s" : ""} analysé{a.messagesClients > 1 ? "s" : ""}.
        {a.messagesClients === 0 && " Aucune donnée sur cette période : aucune suggestion n'est produite."}
      </div>

      <div className="card p-3">
        <b>Suggestions fondées sur les données</b>
        {a.suggestions.length === 0 ? (
          <p className="text-sm text-slate-500 mt-1">Pas assez de données réelles pour proposer quoi que ce soit (il faut au moins 2 clients concernés).</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {a.suggestions.slice(0, 15).map((s) => (
              <li key={s.id}>
                <span className="text-xs rounded bg-slate-100 px-1.5 py-0.5">{CAT_LABEL[s.categorie] ?? s.categorie}</span> <b>{s.titre}</b>
                <p className="text-sm">{s.texte}</p>
                <Exemples items={s.exemples} from={here} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-3 space-y-2">
        <b>Idées rédigées par l&apos;IA (TikTok, Snapchat, formations, promotions…)</b>
        <p className="text-xs text-slate-500">Un seul appel IA, uniquement quand tu cliques, à partir des chiffres ci-dessus (aucun nom ni numéro n&apos;est envoyé).</p>
        <form action={generateAiIdeasAction}>
          <input type="hidden" name="p" value={period.preset} />
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <button className="btn" disabled={a.messagesClients === 0}>Générer des idées</button>
        </form>
        {ideas.texte && ideas.cle === ideasKey && (
          <div className="rounded border border-slate-200 p-2 text-sm whitespace-pre-wrap">
            {ideas.texte}
            <div className="text-xs text-slate-500 mt-1">Généré le {hour(ideas.ts)} par l&apos;IA — à valider avant toute décision.</div>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Block titre="Services les plus demandés" items={a.services} vide="Aucune demande de service identifiée." from={here} />
        <Block titre="Formations les plus demandées" items={a.formations} vide="Aucune demande de formation." from={here} />
        <Block titre="Fournisseurs les plus recherchés" items={a.fournisseurs} vide="Aucune recherche de fournisseur." from={here} />
        <Block titre="Produits qui intéressent les prospects" items={a.produits} vide="Aucun produit demandé." from={here} />
        <Block titre="Demandes sans réponse / sans offre" items={a.sansOffre} vide="Aucune question restée sans réponse." from={here} />
        <Block titre="Objections exprimées" items={a.objections} vide="Aucune objection exprimée." from={here} />
        <Block titre="Difficultés rencontrées" items={a.difficultes} vide="Aucune difficulté exprimée." from={here} />
        <Block titre="Raisons de non-achat exprimées (fiches perdues)" items={a.raisonsNonAchat} vide="Aucune fiche perdue avec un motif écrit par le client." from={here} />
        <Block
          titre="Nouvelles tendances (vs période précédente)"
          items={a.tendances.map((t) => ({ ...t, label: `${t.label} — ${t.evolution === "nouveau" ? "nouveau" : `en hausse (${t.precedent} → ${t.nbClients})`}` }))}
          vide="Aucune tendance nette (il faut au moins 3 clients et un vrai changement)."
          from={here}
        />
        <div className="card p-3">
          <b>Offres : intérêt vs ventes</b>
          {a.offres.length === 0 ? (
            <p className="text-sm text-slate-500 mt-1">Aucune fiche commerciale sur la période.</p>
          ) : (
            <table className="w-full text-sm mt-1">
              <thead><tr className="text-left text-xs text-slate-500"><th>Offre</th><th>Fiches</th><th>Devis</th><th>Gagnées</th><th>Perdues</th></tr></thead>
              <tbody>
                {a.offres.map((o) => (
                  <tr key={o.offre}><td>{o.offre}{a.interetSansVente.some((x) => x.offre === o.offre) ? " ⚠️" : ""}</td><td>{o.fiches}</td><td>{o.devis}</td><td>{o.gagnees}</td><td>{o.perdues}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
