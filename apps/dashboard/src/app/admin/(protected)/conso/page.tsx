import { kimiFlows, lastKimiSnap, refreshKimiBalance } from "@arbi/core";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { PRIX_DEFAUT, coutUsd } from "@/lib/api-balance";
import { parsePeriod, parisMidnight, parisYmd } from "@/lib/period";
import { PeriodFilter } from "../period-filter";

export const dynamic = "force-dynamic";

/**
 * Repères relevés sur la console Kimi le 12/11/2026 (capture de Lilou) : 40 $ rechargés au total,
 * 5 $ de bons. Les recharges suivantes sont détectées automatiquement (hausse du solde).
 */
const RECHARGE_BASE = 40;
const BONS = 5;

const usd = (n: number): string => `$ ${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const heure = (ts: number): string =>
  new Date(ts).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function estimation(from: number, to: number): number {
  const r = getRuntime()
    .core.sqlite.prepare(
      `SELECT COALESCE(SUM(input_tokens),0) AS i, COALESCE(SUM(output_tokens),0) AS o FROM llm_usage WHERE created_at >= ? AND created_at < ?`,
    )
    .get(from, to) as { i: number; o: number };
  return coutUsd({ entree: r.i, sortie: r.o }, PRIX_DEFAUT);
}

/** Conso d'une tranche : réelle si les relevés la couvrent, sinon estimation par les tokens (marquée ≈). */
function tranche(from: number, to: number): { usd: number; estime: boolean } {
  const f = kimiFlows(getRuntime().core, from, to);
  if (f.couvert) return { usd: f.conso, estime: false };
  if (f.premier !== null && f.premier < to) return { usd: f.conso + estimation(from, f.premier), estime: true };
  return { usd: estimation(from, to), estime: true };
}

export default async function ConsoPage({ searchParams }: { searchParams: Promise<{ periode?: string; du?: string; au?: string }> }) {
  await requireSession();
  const params = await searchParams;
  const period = parsePeriod({ periode: params.periode ?? "aujourdhui", du: params.du, au: params.au });
  const { core } = getRuntime();
  const maj = await refreshKimiBalance(core, process.env.ANTHROPIC_API_KEY ?? "", process.env.ANTHROPIC_BASE_URL || undefined);
  const snap = lastKimiSnap(core);
  const now = Date.now();

  const auj = tranche(parisMidnight(parisYmd(now)), now + 1);
  const debutMois = parisMidnight(parisYmd(now).slice(0, 8) + "01");
  const mois = tranche(debutMois, now + 1);
  const perio = tranche(period.from, period.to + 1);
  const toutes = kimiFlows(core, 0, now + 1);
  const totalRecharge = RECHARGE_BASE + toutes.recharges;
  const totalConso = snap ? totalRecharge + BONS - snap.available : null;

  // Graphique : par heure sur 1 jour, sinon par jour.
  const unJour = period.to - period.from <= 26 * 3_600_000;
  const barres: Array<{ label: string; usd: number; estime: boolean }> = [];
  if (unJour) {
    for (let t = period.from; t < Math.min(period.to, now); t += 3_600_000) {
      const r = tranche(t, t + 3_600_000);
      barres.push({ label: new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit" }), ...r });
    }
  } else {
    let ymd = parisYmd(period.from);
    for (let i = 0; i < 400; i++) {
      const a = parisMidnight(ymd);
      if (a >= period.to) break;
      const b = parisMidnight(parisYmd(a + 36 * 3_600_000));
      const r = tranche(a, Math.min(b, now + 1));
      barres.push({ label: `${ymd.slice(8)}/${ymd.slice(5, 7)}`, ...r });
      ymd = parisYmd(b);
    }
  }
  const max = Math.max(0.01, ...barres.map((b) => b.usd));
  const ilYaEstime = barres.some((b) => b.estime) || perio.estime;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Consommation Kimi</h1>
        <p className="text-sm text-neutral-500">
          {snap ? `Solde lu directement sur Kimi — dernier relevé ${heure(snap.ts)} (mis à jour toutes les 10 min).` : "Aucun relevé Kimi pour l'instant."}
          {!maj.ok && ` ⚠️ Lecture du solde impossible : ${maj.error}.`}
        </p>
      </div>

      <div className="aj-kimi-grid">
        <div className="card">
          <p className="aj-kimi-l">Solde disponible</p>
          <p className="aj-kimi-v" style={snap && snap.available < 3 ? { color: "#f0142f" } : undefined}>
            {snap ? usd(snap.available) : "—"}
          </p>
          {snap && snap.available < 3 && <p className="text-xs" style={{ color: "#f0142f" }}>Solde bas : recharge Kimi.</p>}
        </div>
        <div className="card">
          <p className="aj-kimi-l">Aujourd&apos;hui</p>
          <p className="aj-kimi-v">{auj.estime ? "≈ " : ""}{usd(auj.usd)}</p>
        </div>
        <div className="card">
          <p className="aj-kimi-l">Ce mois-ci</p>
          <p className="aj-kimi-v">{mois.estime ? "≈ " : ""}{usd(mois.usd)}</p>
        </div>
        <div className="card">
          <p className="aj-kimi-l">Consommation totale</p>
          <p className="aj-kimi-v">{totalConso !== null ? usd(totalConso) : "—"}</p>
        </div>
        <div className="card">
          <p className="aj-kimi-l">Total rechargé</p>
          <p className="aj-kimi-v aj-kimi-v--s">{usd(totalRecharge)}</p>
        </div>
        <div className="card">
          <p className="aj-kimi-l">Bons (vouchers)</p>
          <p className="aj-kimi-v aj-kimi-v--s">{usd(BONS)}</p>
        </div>
      </div>

      <div className="card space-y-3" id="conso">
        <h2 className="font-semibold">Consommation par période</h2>
        <PeriodFilter period={period} base="/admin/conso" ancre="conso" />
        <p className="text-3xl font-bold">
          {perio.estime ? "≈ " : ""}
          {usd(perio.usd)}
        </p>
        <div className="aj-kimi-chart" role="img" aria-label="Consommation par tranche">
          {barres.map((b, i) => (
            <div key={i} className="aj-kimi-col" title={`${b.label} : ${usd(b.usd)}${b.estime ? " (estimé)" : ""}`}>
              <div className={`aj-kimi-bar${b.estime ? " is-est" : ""}`} style={{ height: `${(b.usd / max) * 100}%` }} />
              <span>{b.label}</span>
            </div>
          ))}
        </div>
        {ilYaEstime && (
          <p className="text-xs text-neutral-500">
            ≈ et barres claires : estimation à partir des tokens (avant le premier relevé du solde
            {toutes.premier ? `, ${heure(toutes.premier)}` : ""}). Ensuite, les chiffres sont ceux de Kimi.
          </p>
        )}
      </div>
    </div>
  );
}
