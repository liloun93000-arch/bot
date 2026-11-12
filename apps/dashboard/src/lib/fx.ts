/**
 * Taux USD → EUR pour convertir la consommation Kimi (facturée en $) dans la compta en €.
 * Source gratuite : Frankfurter (taux de la Banque centrale européenne), mis en cache 12 h.
 * Si la source ne répond pas, on garde le dernier taux connu, sinon un taux de secours affiché comme tel.
 */
const SECOURS = 0.86;
let cache: { taux: number; date: string; ts: number } | null = null;

export async function usdEur(): Promise<{ taux: number; date: string; secours: boolean }> {
  if (cache && Date.now() - cache.ts < 12 * 3_600_000) return { taux: cache.taux, date: cache.date, secours: false };
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR", { signal: AbortSignal.timeout(4000) });
    const j = (await r.json()) as { rates?: { EUR?: number }; date?: string };
    if (r.ok && typeof j.rates?.EUR === "number") {
      cache = { taux: j.rates.EUR, date: j.date ?? "", ts: Date.now() };
      return { taux: cache.taux, date: cache.date, secours: false };
    }
  } catch {
    /* source indisponible */
  }
  if (cache) return { taux: cache.taux, date: cache.date, secours: false };
  return { taux: SECOURS, date: "", secours: true };
}
