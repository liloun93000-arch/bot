import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { parsePeriod, periodQuery } from "@/lib/period";
import { recalculerDemandesAction } from "@/lib/actions";
import { categoryCounts, excludedCount } from "@arbi/core";
import { PeriodFilter } from "../period-filter";

export const dynamic = "force-dynamic";

/** Toutes les catégories de demandes de la période, chacune ouvrant le détail de ses demandes. */
export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ periode?: string; du?: string; au?: string }> }) {
  await requireSession();
  const period = parsePeriod(await searchParams);
  const { core } = getRuntime();
  const cats = categoryCounts(core, period.from, period.to);
  const total = cats.reduce((a, c) => a + c.n, 0);
  const max = Math.max(1, ...cats.map((c) => c.n));
  const exclues = excludedCount(core, period.from, period.to);
  const retour = `/admin/categories?${periodQuery(period)}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Demandes par catégorie</h1>
        <Link href="/admin" className="btn btn-secondary text-sm">← Accueil</Link>
      </div>
      <div className="card">
        <PeriodFilter period={period} base="/admin/categories" ancre="liste" />
        <p className="mt-3 text-sm text-neutral-600" id="liste">
          <b>{total}</b> demande{total > 1 ? "s" : ""} dans {cats.length} catégorie{cats.length > 1 ? "s" : ""}. Touche une catégorie pour voir chaque demande, le message exact et sa conversation.
        </p>
        {cats.length === 0 && <p className="mt-3 text-sm text-neutral-500">Aucune demande sur cette période.</p>}
        <div className="mt-3 space-y-2">
          {cats.map((c) => (
            <Link
              key={c.categorie}
              href={`/admin/categories/detail?c=${encodeURIComponent(c.categorie)}&${periodQuery(period)}`}
              className="flex items-center gap-2 rounded hover:bg-neutral-50"
            >
              <span className="w-40 shrink-0 text-sm">{c.categorie}</span>
              <div className="h-4 flex-1 overflow-hidden rounded bg-neutral-100">
                <div className="h-full rounded" style={{ width: `${(c.n / max) * 100}%`, background: "linear-gradient(90deg, #b3121f, #ff2d3d)" }} />
              </div>
              <span className="w-8 text-right text-sm font-semibold">{c.n}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="card text-sm text-neutral-600">
        <p>
          <b>{exclues}</b> message{exclues > 1 ? "s" : ""} de la période {exclues > 1 ? "ne sont" : "n'est"} pas comptés comme demande (salutations, remerciements, confirmations, suites d&apos;une demande déjà comptée). Ils restent consultables dans chaque catégorie (« Voir les exclus »).
        </p>
        <form action={recalculerDemandesAction} className="mt-2">
          <input type="hidden" name="retour" value={retour} />
          <button className="btn btn-secondary text-sm">Recalculer les statistiques à partir des conversations</button>
          <span className="ml-2 text-xs">Sans IA payante ni suppression ; tes corrections manuelles sont conservées.</span>
        </form>
      </div>
    </div>
  );
}
