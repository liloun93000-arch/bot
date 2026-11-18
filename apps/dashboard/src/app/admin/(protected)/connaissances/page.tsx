import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { saveKnowledgeDocAction, toggleKnowledgeSharingAction } from "@/lib/actions";
import { kbList, kbSearch, kbStale, kbVersions } from "@arbi/core";

export const dynamic = "force-dynamic";

const FIAB: Record<string, string> = {
  officielle_verifiee: "✅ Source officielle vérifiée",
  validee_jacob: "🟦 Validée par Jacob",
  a_verifier: "⚠️ À vérifier (non confirmée)",
  interne: "🔒 Interne",
};
const date = (ts: number | null) => (ts ? new Date(ts).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "jamais");

export default async function ConnaissancesPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  await requireSession();
  const { q = "", cat = "" } = await searchParams;
  const { core } = getRuntime();
  const docs = kbList(core, cat ? { categorie: cat } : {});
  const categories = [...new Set(kbList(core).map((d) => d.categorie))];
  const hits = q.trim() ? kbSearch(core, q, { limit: 8, includeObsolete: true }) : [];
  const stale = kbStale(core);
  const shown = q.trim() ? hits.map((h) => h.doc) : docs;
  const partage = core.settings.get("kb_clients_actif") === true;

  return (
    <div className="space-y-4">
      <div className="aj-lead-hero">
        <h1>📚 Base de connaissances LLC / LTD</h1>
        <p>
          Base partagée entre le bot principal et les futurs agents spécialisés. Les informations <b>réglementaires</b> viennent des autorités
          (avec lien et date de vérification) ; les informations <b>commerciales</b> sont validées par toi et ne sont jamais modifiées automatiquement.
          Seuls les extraits pertinents sont envoyés à l&apos;IA.
        </p>
      </div>

      <form action={toggleKnowledgeSharingAction} className="card p-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="kb_clients_actif" defaultChecked={partage} />
          <span>Partager avec le bot WhatsApp les connaissances cochées « visible pour les clients » (désactivé par défaut)</span>
        </label>
        <button className="btn">Enregistrer</button>
      </form>

      <div className="card p-3">
        <b>À revérifier : {stale.length}</b>
        <ul className="text-sm mt-1 space-y-0.5 max-h-40 overflow-auto">
          {stale.slice(0, 40).map((s) => (
            <li key={`${s.doc.id}-${s.raison}`}>
              {s.doc.titre} — <span className="text-slate-500">{s.detail}</span>
            </li>
          ))}
          {stale.length === 0 && <li className="text-slate-500">Tout est à jour.</li>}
        </ul>
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Rechercher (ex. EIN, Form 5472, impôt Hong Kong)" className="input" />
        <select name="cat" defaultValue={cat} className="input">
          <option value="">Toutes les catégories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btn-primary">Filtrer</button>
      </form>

      <div className="space-y-2">
        {shown.map((d) => (
          <details key={d.id} className="card p-3">
            <summary className="cursor-pointer">
              <b>{d.titre}</b>{" "}
              <span className="text-xs text-slate-500">
                {d.categorie} · {d.juridiction || "général"} · v{d.version} · {FIAB[d.fiabilite] ?? d.fiabilite} · vérifié : {date(d.verifieLe)}
                {d.statut === "obsolete" ? " · OBSOLÈTE" : ""}{d.visibleClient ? " · visible clients" : ""}
              </span>
            </summary>
            <form action={saveKnowledgeDocAction.bind(null, d.id)} className="space-y-2 mt-2">
              <input name="titre" defaultValue={d.titre} className="input" />
              <textarea name="contenu" defaultValue={d.contenu} rows={8} className="input" />
              <input name="conditions" defaultValue={d.conditions} placeholder="Conditions / limites" className="input" />
              <div className="grid gap-2 sm:grid-cols-2">
                <input name="source" defaultValue={d.source} placeholder="Source" className="input" />
                <input name="source_url" defaultValue={d.sourceUrl} placeholder="Lien officiel" className="input" />
              </div>
              <input name="motif" placeholder="Motif de la modification (historique)" className="input" />
              <div className="flex flex-wrap gap-4 text-sm">
                <label><input type="checkbox" name="verifie" /> Je l&apos;ai vérifié sur la source officielle aujourd&apos;hui</label>
                <label><input type="checkbox" name="obsolete" defaultChecked={d.statut === "obsolete"} /> Obsolète</label>
                <label><input type="checkbox" name="visible_client" defaultChecked={d.visibleClient} /> Visible pour les clients</label>
              </div>
              <button className="btn btn-primary">Enregistrer (nouvelle version si le texte change)</button>
              <p className="text-xs text-slate-500">
                Historique : {kbVersions(core, d.id).map((v) => `v${v.version} (${date(v.ts)})`).join(" · ")}
              </p>
            </form>
          </details>
        ))}
        {shown.length === 0 && <p className="text-slate-500">Aucune connaissance trouvée.</p>}
      </div>
    </div>
  );
}
