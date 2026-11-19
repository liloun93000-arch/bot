import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { parsePeriod, periodQuery, previousPeriod } from "@/lib/period";
import { clickSeries, listSources } from "@/lib/tracking";
import { PeriodFilter } from "../../period-filter";
import { VisitChart } from "../../visit-chart";

export const dynamic = "force-dynamic";

type SP = { s?: string; g?: string; periode?: string; du?: string; au?: string };

export default async function SourceDetailPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireSession();
  const sp = await searchParams;
  const { core } = getRuntime();
  const period = parsePeriod(sp);
  const sources = listSources(core);
  const source = sources.find((x) => x.slug === sp.s) ?? null; // null = toutes les sources
  const gran = sp.g === "mois" ? "mois" : "jour";
  const prev = previousPeriod(period);

  const series = clickSeries(core, source?.id ?? null, period.from, period.to + 1, gran);
  const total = series.reduce((a, x) => a + x.pages, 0);
  const before = clickSeries(core, source?.id ?? null, prev.from, prev.to, "jour").reduce((a, x) => a + x.pages, 0);
  const evo = before ? Math.round(((total - before) / before) * 100) : null;
  const best = series.reduce<(typeof series)[number] | null>((b, x) => (!b || x.pages > b.pages ? x : b), null);
  const pq = periodQuery(period);
  const base = (slug: string | null, g: string) => `/admin/sources/detail?${slug ? `s=${encodeURIComponent(slug)}&` : ""}${pq}&g=${g}`;
  const extra: Record<string, string> = { g: gran, ...(source ? { s: source.slug } : {}) };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Clics — {source ? source.nom : "toutes les sources"}</h1>
        <Link href={`/admin?${pq}`} className="btn btn-secondary text-sm">← Accueil</Link>
      </div>

      <div className="aj-cv-legend">
        <Link href={base(null, gran)} className={`aj-cv-chip${source ? "" : " is-unread"}`}>Toutes</Link>
        {sources.map((x) => (
          <Link key={x.id} href={base(x.slug, gran)} className={`aj-cv-chip${source?.id === x.id ? " is-unread" : ""}`}>{x.nom}</Link>
        ))}
      </div>

      <div className="card space-y-3" id="evolution">
        <PeriodFilter period={period} base="/admin/sources/detail" ancre="evolution" extra={extra} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-neutral-500">Regrouper par :</span>
          <Link href={base(source?.slug ?? null, "jour")} className={`aj-cv-chip${gran === "jour" ? " is-unread" : ""}`}>Jour</Link>
          <Link href={base(source?.slug ?? null, "mois")} className={`aj-cv-chip${gran === "mois" ? " is-unread" : ""}`}>Mois</Link>
          {period.to - period.from <= 26 * 3_600_000 && <span className="text-xs text-neutral-500">(période d&apos;un jour : affichage par heure)</span>}
        </div>
        <p className="text-sm">
          <b>{total}</b> clic{total > 1 ? "s" : ""} sur la période
          {evo !== null && <span className={evo >= 0 ? " text-green-500" : " text-red-500"}> {evo >= 0 ? "▲" : "▼"}{Math.abs(evo)} % vs période précédente ({before})</span>}
          {best && best.pages > 0 && <span className="text-neutral-500"> · pic : {best.pages} le {best.detail}</span>}
        </p>
        <VisitChart tranches={series} mode="clics" />
        <p className="text-xs text-neutral-500">
          Un clic est un passage sur le lien de suivi de la source. Ce n&apos;est pas un contact : WhatsApp ne permet pas de savoir d&apos;où vient chaque client.
        </p>
      </div>
    </div>
  );
}
