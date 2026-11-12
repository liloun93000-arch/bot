import type { Core } from "@arbi/core";

/**
 * Suivi du solde de l'API Kimi : Lilou saisit le solde affiché chez Kimi ($), on estime ensuite
 * ce qui a été consommé depuis, à partir des tokens réellement comptés à chaque réponse (table llm_usage).
 * C'est une ESTIMATION : le solde exact reste celui de la console Kimi.
 */

/** Tarifs officiels kimi-k2.6 (kimi.ai, novembre 2026), en $ par million de tokens. */
export const PRIX_DEFAUT = { entree: 0.95, sortie: 4.0 };

export interface SoldeSaisi {
  soldeUsd: number;
  prixEntree: number;
  prixSortie: number;
  createdAt: number;
}

const ready = new WeakSet<object>();
function ensure(core: Core): void {
  if (ready.has(core)) return;
  core.sqlite
    .prepare(
      `CREATE TABLE IF NOT EXISTS api_balance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        solde_usd REAL NOT NULL,
        prix_entree REAL NOT NULL,
        prix_sortie REAL NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    )
    .run();
  ready.add(core);
}

export function saisirSolde(core: Core, s: SoldeSaisi): void {
  ensure(core);
  core.sqlite
    .prepare(`INSERT INTO api_balance (solde_usd, prix_entree, prix_sortie, created_at) VALUES (?, ?, ?, ?)`)
    .run(s.soldeUsd, s.prixEntree, s.prixSortie, s.createdAt);
}

export function dernierSolde(core: Core): SoldeSaisi | null {
  ensure(core);
  const r = core.sqlite
    .prepare(`SELECT solde_usd, prix_entree, prix_sortie, created_at FROM api_balance ORDER BY created_at DESC, id DESC LIMIT 1`)
    .get() as { solde_usd: number; prix_entree: number; prix_sortie: number; created_at: number } | undefined;
  return r ? { soldeUsd: r.solde_usd, prixEntree: r.prix_entree, prixSortie: r.prix_sortie, createdAt: r.created_at } : null;
}

function tokens(core: Core, from: number, to: number): { entree: number; sortie: number; appels: number } {
  const r = core.sqlite
    .prepare(
      `SELECT COALESCE(SUM(input_tokens),0) AS i, COALESCE(SUM(output_tokens),0) AS o, COUNT(*) AS n
       FROM llm_usage WHERE created_at >= ? AND created_at < ?`,
    )
    .get(from, to) as { i: number; o: number; n: number };
  return { entree: r.i, sortie: r.o, appels: r.n };
}

export const coutUsd = (t: { entree: number; sortie: number }, p: { entree: number; sortie: number }): number =>
  (t.entree / 1e6) * p.entree + (t.sortie / 1e6) * p.sortie;

/** Début du jour (heure de Paris) contenant `ts`. */
function debutJourParis(ts: number): number {
  const ymd = new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  for (const off of [1, 2]) {
    const t = Date.parse(`${ymd}T00:00:00+0${off}:00`);
    if (new Date(t).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }) === ymd &&
        new Date(t - 1).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }) !== ymd) return t;
  }
  return Date.parse(`${ymd}T00:00:00Z`);
}

export interface SuiviConso {
  saisie: SoldeSaisi | null;
  prix: { entree: number; sortie: number };
  depuisSaisie: { entree: number; sortie: number; appels: number; usd: number };
  restantUsd: number | null;
  jours: Array<{ jour: string; appels: number; usd: number }>;
  moyenneJourUsd: number;
  joursRestants: number | null;
}

export function suiviConso(core: Core, now: number = Date.now()): SuiviConso {
  const saisie = dernierSolde(core);
  const prix = saisie ? { entree: saisie.prixEntree, sortie: saisie.prixSortie } : PRIX_DEFAUT;
  const t = saisie ? tokens(core, saisie.createdAt, now + 1) : { entree: 0, sortie: 0, appels: 0 };
  const usd = coutUsd(t, prix);
  const jours: SuiviConso["jours"] = [];
  let debut = debutJourParis(now);
  let fin = now + 1;
  for (let i = 0; i < 7; i++) {
    const x = tokens(core, debut, fin);
    jours.push({
      jour: new Date(debut + 3_600_000 * 12).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "numeric", timeZone: "Europe/Paris" }),
      appels: x.appels,
      usd: coutUsd(x, prix),
    });
    fin = debut;
    debut = debutJourParis(debut - 3_600_000);
  }
  // Moyenne sur les 7 derniers jours COMPLETS (hors aujourd'hui).
  const complets = jours.slice(1);
  const moyenneJourUsd = complets.reduce((s, j) => s + j.usd, 0) / complets.length;
  const restantUsd = saisie ? saisie.soldeUsd - usd : null;
  const joursRestants = restantUsd !== null && moyenneJourUsd > 0 ? Math.max(0, restantUsd) / moyenneJourUsd : null;
  return { saisie, prix, depuisSaisie: { ...t, usd }, restantUsd, jours, moyenneJourUsd, joursRestants };
}
