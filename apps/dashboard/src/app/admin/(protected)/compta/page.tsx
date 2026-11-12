import Link from "next/link";
import { kimiFlows } from "@arbi/core";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { CATS_ENTREE, CATS_SORTIE, MOYENS, ecritures, totaux } from "@/lib/compta";
import { ajouterEcritureAction, supprimerEcritureAction } from "@/lib/compta-actions";
import { parsePeriod, parisYmd } from "@/lib/period";
import { PeriodFilter } from "../period-filter";

export const dynamic = "force-dynamic";

const eur = (c: number): string => `${(c / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export default async function ComptaPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; du?: string; au?: string; msg?: string; sens?: string }>;
}) {
  await requireSession();
  const p = await searchParams;
  const period = parsePeriod({ periode: p.periode ?? "30j", du: p.du, au: p.au });
  const { core } = getRuntime();
  const list = ecritures(core, period.from, period.to + 1);
  const t = totaux(list);
  const kimi = kimiFlows(core, period.from, period.to + 1).conso;
  const sens = p.sens === "sortie" ? "sortie" : "entree";
  const cats = sens === "entree" ? CATS_ENTREE : CATS_SORTIE;
  const resultat = t.entrees - t.sorties;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">💶 Compta</h1>
        <p className="text-sm text-neutral-500">
          Note chaque vente encaissée et chaque achat. La consommation Kimi est ajoutée toute seule.
        </p>
      </div>
      {p.msg && <div className="card text-sm font-medium">{p.msg}</div>}

      <div className="card space-y-3" id="periode">
        <PeriodFilter period={period} base="/admin/compta" />
        <div className="aj-compta-sum">
          <div className="is-in">
            <span>Encaissé</span>
            <b>{eur(t.entrees)}</b>
          </div>
          <div className="is-out">
            <span>Dépensé</span>
            <b>{eur(t.sorties)}</b>
          </div>
          <div className="is-kimi">
            <span>Kimi (IA)</span>
            <b>{kimi.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</b>
          </div>
          <div className={resultat >= 0 ? "is-res" : "is-neg"}>
            <span>Reste (hors Kimi)</span>
            <b>{eur(resultat)}</b>
          </div>
        </div>
        {t.parCat.length > 0 && (
          <div className="aj-compta-cats">
            {t.parCat.map(([cat, s, v]) => (
              <span key={s + cat} className={s === "entree" ? "is-in" : "is-out"}>
                {cat} : <b>{s === "entree" ? "+" : "−"}{eur(v)}</b>
              </span>
            ))}
          </div>
        )}
      </div>

      <form action={ajouterEcritureAction} className="card space-y-3" id="saisie">
        <div className="aj-compta-switch">
          <Link href="/admin/compta?sens=entree#saisie" className={sens === "entree" ? "is-on is-in" : ""} scroll={false}>
            + Vente / argent reçu
          </Link>
          <Link href="/admin/compta?sens=sortie#saisie" className={sens === "sortie" ? "is-on is-out" : ""} scroll={false}>
            − Achat / dépense
          </Link>
        </div>
        <input type="hidden" name="sens" value={sens} />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            Montant (€)
            <input name="montant" inputMode="decimal" required placeholder="600" className="input w-full" />
          </label>
          <label className="text-sm">
            Date
            <input name="date" type="date" defaultValue={parisYmd(Date.now())} className="input w-full" />
          </label>
        </div>
        <label className="block text-sm">
          Catégorie
          <select name="categorie" className="input w-full" defaultValue={cats[0]}>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          {sens === "entree" ? "Client (prénom ou numéro)" : "Fournisseur / pour quoi"}
          <input name="client" className="input w-full" placeholder={sens === "entree" ? "Ex. Karim" : "Ex. Railway"} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            Payé par
            <select name="moyen" className="input w-full" defaultValue="">
              <option value="">—</option>
              {MOYENS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Note
            <input name="libelle" className="input w-full" placeholder="Facultatif" />
          </label>
        </div>
        <button type="submit" className="btn btn-primary w-full">
          {sens === "entree" ? "Enregistrer la vente" : "Enregistrer la dépense"}
        </button>
      </form>

      <div className="space-y-2">
        <h2 className="font-semibold">Détail — {period.label}</h2>
        {list.length === 0 && <div className="card text-sm text-neutral-400">Rien sur cette période.</div>}
        {list.map((e) => (
          <article key={e.id} className={`card aj-compta-line ${e.sens === "entree" ? "is-in" : "is-out"}`}>
            <div className="min-w-0">
              <p className="font-semibold">
                {e.categorie}
                {e.client && <span className="text-neutral-400"> · {e.client}</span>}
              </p>
              <p className="text-xs text-neutral-500">
                {new Date(e.dateTs).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}
                {e.moyen && ` · ${e.moyen}`}
                {e.libelle && ` · ${e.libelle}`}
              </p>
            </div>
            <div className="aj-compta-right">
              <b>
                {e.sens === "entree" ? "+" : "−"}
                {eur(e.montantCents)}
              </b>
              <form action={supprimerEcritureAction.bind(null, e.id)}>
                <button type="submit" className="aj-compta-del" aria-label="Supprimer cette ligne">
                  Supprimer
                </button>
              </form>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
