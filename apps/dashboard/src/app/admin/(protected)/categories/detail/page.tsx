import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { parsePeriod, periodQuery } from "@/lib/period";
import { setQuestionCategoryAction } from "@/lib/actions";
import { ALL_CATEGORIES, categoryDetail } from "@arbi/core";
import { PeriodFilter } from "../../period-filter";

export const dynamic = "force-dynamic";

const quand = (ts: number) =>
  new Date(ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
const ROLE: Record<string, string> = { user: "Client", assistant: "Bot", human: "Jacob" };

export default async function CategorieDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; periode?: string; du?: string; au?: string; exclus?: string }>;
}) {
  await requireSession();
  const sp = await searchParams;
  const categorie = sp.c ?? "";
  const exclues = sp.exclus === "1";
  const period = parsePeriod(sp);
  const { core } = getRuntime();
  const { total, items } = categoryDetail(core, categorie, period.from, period.to, { exclues });
  const here = `/admin/categories/detail?c=${encodeURIComponent(categorie)}&${periodQuery(period)}${exclues ? "&exclus=1" : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{categorie || "Catégorie"}</h1>
        <Link href={`/admin/categories?${periodQuery(period)}`} className="btn btn-secondary text-sm">← Toutes les catégories</Link>
      </div>
      <div className="card">
        <PeriodFilter period={period} base="/admin/categories/detail" ancre="demandes" extra={{ c: categorie, ...(exclues ? { exclus: "1" } : {}) }} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2" id="demandes">
          <p className="text-sm">
            <b>{total}</b> {exclues ? "message" : "demande"}{total > 1 ? "s" : ""} {exclues ? "exclu" : ""}{exclues && total > 1 ? "s" : ""} sur la période
            {items.length < total ? ` (les ${items.length} plus récentes affichées)` : ""}.
          </p>
          <Link
            href={`/admin/categories/detail?c=${encodeURIComponent(categorie)}&${periodQuery(period)}${exclues ? "" : "&exclus=1"}`}
            className="text-sm underline"
          >
            {exclues ? "Voir les demandes comptées" : "Voir les exclus (non comptés)"}
          </Link>
        </div>
      </div>

      {items.length === 0 && <div className="card text-sm text-neutral-500">Rien à afficher pour cette catégorie sur la période.</div>}

      {items.map((d) => (
        <div key={d.id} className="card space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <b>{d.nom || `+${d.waId}`}</b> <span className="text-xs text-neutral-500">+{d.waId}</span>
            </div>
            <span className="text-xs text-neutral-500">{quand(d.ts)}</span>
          </div>
          <div className="rounded-lg bg-neutral-50 p-2 text-sm">
            <div className="text-xs text-neutral-500">Message qui a déclenché le classement</div>
            « {d.texte} »
          </div>
          {d.raison && <p className="text-xs text-neutral-500">Pourquoi pas comptée : {d.raison}</p>}
          {d.manuelle && <p className="text-xs text-neutral-500">Catégorie corrigée à la main (système : {d.categorieAuto || "—"}).</p>}
          {(d.avant.length > 0 || d.apres) && (
            <details>
              <summary className="cursor-pointer text-xs text-neutral-500">Contexte de la conversation</summary>
              <ul className="mt-1 space-y-1 text-sm">
                {d.avant.map((m, i) => (
                  <li key={i} className="text-neutral-600"><b>{ROLE[m.role] ?? m.role}</b> ({quand(m.ts)}) : {m.contenu.slice(0, 280)}</li>
                ))}
                {d.apres && <li className="text-neutral-600"><b>{ROLE[d.apres.role] ?? d.apres.role}</b> (réponse, {quand(d.apres.ts)}) : {d.apres.contenu.slice(0, 280)}</li>}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/conversations/${d.waId}?from=${encodeURIComponent(here)}`} className="btn btn-secondary text-sm">
              Ouvrir la conversation WhatsApp
            </Link>
            <form action={setQuestionCategoryAction.bind(null, d.id)} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="retour" value={here} />
              <select name="categorie" defaultValue={d.demande ? d.categorie : ""} className="input text-sm">
                {!d.demande && <option value="" disabled>Choisir une catégorie…</option>}
                {(d.demande && !ALL_CATEGORIES.includes(d.categorie) ? [d.categorie, ...ALL_CATEGORIES] : ALL_CATEGORIES).map((c) => <option key={c} value={c}>{c}</option>)}
                {d.demande && <option value="__aucune">— Pas une demande —</option>}
              </select>
              <button className="btn btn-secondary text-sm">{d.demande ? "Corriger" : "Compter comme demande"}</button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
