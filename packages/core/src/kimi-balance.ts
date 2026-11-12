import type { Core } from "./db";

/**
 * Solde Kimi RÉEL, lu sur l'API Moonshot (GET /v1/users/me/balance) et photographié régulièrement.
 * La consommation d'une période = somme des baisses du solde entre deux relevés ; une hausse = recharge.
 * C'est donc exactement ce que Kimi facture (inférence + context caching), pas une estimation.
 */

export interface KimiSnap {
  ts: number;
  available: number;
  voucher: number;
  cash: number;
}

const ready = new WeakSet<object>();
function ensure(core: Core): void {
  if (ready.has(core)) return;
  core.sqlite
    .prepare(
      `CREATE TABLE IF NOT EXISTS kimi_balance_snaps (
        ts INTEGER PRIMARY KEY,
        available REAL NOT NULL,
        voucher REAL NOT NULL,
        cash REAL NOT NULL
      )`,
    )
    .run();
  ready.add(core);
}

/** Origine de l'API Moonshot déduite de ANTHROPIC_BASE_URL (ex. https://api.moonshot.ai/anthropic). */
export function moonshotOrigin(baseUrl: string | undefined): string {
  try {
    if (baseUrl) {
      const u = new URL(baseUrl);
      if (/moonshot|kimi/.test(u.hostname)) return u.origin;
    }
  } catch {
    /* défaut */
  }
  return "https://api.moonshot.ai";
}

export async function fetchKimiBalance(apiKey: string, baseUrl?: string): Promise<KimiSnap> {
  const res = await fetch(`${moonshotOrigin(baseUrl)}/v1/users/me/balance`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Kimi balance HTTP ${res.status}`);
  const j = (await res.json()) as { data?: { available_balance?: number; voucher_balance?: number; cash_balance?: number } };
  const d = j.data ?? {};
  if (typeof d.available_balance !== "number") throw new Error("Kimi balance: réponse inattendue");
  return { ts: Date.now(), available: d.available_balance, voucher: d.voucher_balance ?? 0, cash: d.cash_balance ?? 0 };
}

export function saveKimiSnap(core: Core, s: KimiSnap): void {
  ensure(core);
  core.sqlite
    .prepare(`INSERT OR REPLACE INTO kimi_balance_snaps (ts, available, voucher, cash) VALUES (?, ?, ?, ?)`)
    .run(s.ts, s.available, s.voucher, s.cash);
}

export function lastKimiSnap(core: Core): KimiSnap | null {
  ensure(core);
  return (core.sqlite.prepare(`SELECT ts, available, voucher, cash FROM kimi_balance_snaps ORDER BY ts DESC LIMIT 1`).get() as
    | KimiSnap
    | undefined) ?? null;
}

/** Relève le solde si le dernier relevé a plus de `maxAgeMs`. Ne lève jamais. */
export async function refreshKimiBalance(
  core: Core,
  apiKey: string,
  baseUrl?: string,
  maxAgeMs = 5 * 60_000,
): Promise<{ ok: boolean; error?: string }> {
  const last = lastKimiSnap(core);
  if (last && Date.now() - last.ts < maxAgeMs) return { ok: true };
  if (!apiKey) return { ok: false, error: "clé API absente" };
  try {
    saveKimiSnap(core, await fetchKimiBalance(apiKey, baseUrl));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Consommation et recharges entre `from` et `to`, d'après les relevés.
 * `couvert` = la période est entièrement couverte par des relevés (sinon le chiffre est partiel).
 */
export function kimiFlows(core: Core, from: number, to: number): { conso: number; recharges: number; couvert: boolean; premier: number | null } {
  ensure(core);
  const rows = core.sqlite
    .prepare(
      `SELECT ts, available FROM (
         SELECT ts, available FROM kimi_balance_snaps WHERE ts < ? ORDER BY ts DESC LIMIT 1
       )
       UNION ALL
       SELECT ts, available FROM kimi_balance_snaps WHERE ts >= ? AND ts <= ?
       ORDER BY ts`,
    )
    .all(from, from, to) as Array<{ ts: number; available: number }>;
  let conso = 0;
  let recharges = 0;
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i]!.available - rows[i - 1]!.available;
    if (d < 0) conso -= d;
    else recharges += d;
  }
  const first = (core.sqlite.prepare(`SELECT MIN(ts) AS t FROM kimi_balance_snaps`).get() as { t: number | null }).t;
  return { conso, recharges, couvert: first !== null && first <= from, premier: first };
}
