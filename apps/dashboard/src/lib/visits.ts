import { createHash } from "node:crypto";
import type { Core } from "@arbi/core";
import { parisMidnight, parisYmd } from "./period";

/**
 * Visites du site public. Aucun cookie : un visiteur = empreinte anonyme (IP + navigateur + jour),
 * hachée et jamais stockée en clair. Les robots (Google, aperçus de liens…) ne sont pas comptés.
 */
export const BOT_VISIT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|snapchat|discord|embedly|headless|lighthouse|pingdom|uptime|curl|wget|python|node-fetch|axios/i;

const ready = new WeakSet<object>();
function ensure(core: Core): void {
  if (ready.has(core)) return;
  core.sqlite
    .prepare(
      `CREATE TABLE IF NOT EXISTS site_visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        path TEXT NOT NULL,
        vid TEXT NOT NULL
      )`,
    )
    .run();
  core.sqlite.prepare(`CREATE INDEX IF NOT EXISTS site_visits_ts ON site_visits (ts)`).run();
  ready.add(core);
}

export function visitorId(ip: string, ua: string, ts: number): string {
  return createHash("sha256").update(`${ip}|${ua}|${parisYmd(ts)}|arbi`).digest("hex").slice(0, 16);
}

export function recordVisit(core: Core, v: { path: string; vid: string; ts?: number }): void {
  ensure(core);
  core.sqlite.prepare(`INSERT INTO site_visits (ts, path, vid) VALUES (?, ?, ?)`).run(v.ts ?? Date.now(), v.path.slice(0, 200), v.vid);
}

export interface VisitStats {
  visiteurs: number;
  pages: number;
  tranches: Array<{ label: string; visiteurs: number; pages: number; detail: string }>;
  topPages: Array<{ path: string; n: number }>;
}

/**
 * Statistiques d'une période : par heure si la période fait un jour, sinon par jour.
 * Une seule lecture de la table (au lieu d'une requête par tranche) : bien plus rapide sur 30 jours ou plus.
 */
export function visitStats(core: Core, from: number, to: number, now = Date.now()): VisitStats {
  ensure(core);
  // 1. Tranches (bornes de début/fin, libellés).
  const bounds: Array<{ a: number; b: number; label: string; detail: string }> = [];
  if (to - from <= 26 * 3_600_000) {
    // `t < to - 1` : la tranche de l'heure en cours est incluse, sans tranche fantôme après la fin.
    for (let t = from; t < to - 1; t += 3_600_000) {
      const h = new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).replace(/\D/g, "");
      bounds.push({ a: t, b: Math.min(t + 3_600_000, to), label: `${h}h`, detail: `${parisYmd(t).slice(8)}/${parisYmd(t).slice(5, 7)} à ${h}h` });
    }
  } else {
    let ymd = parisYmd(from);
    for (let i = 0; i < 400; i++) {
      const a = parisMidnight(ymd);
      // `to - 1` : l'appelant passe « fin + 1 ms » ; sans cela, un jour fantôme vide s'ajoutait après chaque période terminée.
      if (a >= to - 1) break;
      const b = parisMidnight(parisYmd(a + 36 * 3_600_000));
      const jj = `${ymd.slice(8)}/${ymd.slice(5, 7)}`;
      bounds.push({ a, b: Math.min(b, to), label: jj, detail: `${jj}/${ymd.slice(0, 4)}` });
      ymd = parisYmd(b);
    }
  }
  // 2. Une seule passe sur les visites, rangées par tranche (recherche dichotomique).
  const sets = bounds.map(() => new Set<string>());
  const pages = bounds.map(() => 0);
  const all = new Set<string>();
  let total = 0;
  const rows = core.sqlite.prepare(`SELECT ts, vid FROM site_visits WHERE ts >= ? AND ts < ? ORDER BY ts`).all(from, to) as Array<{ ts: number; vid: string }>;
  for (const r of rows) {
    total++;
    all.add(r.vid);
    let lo = 0;
    let hi = bounds.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (r.ts < bounds[mid]!.a) hi = mid - 1;
      else if (r.ts >= bounds[mid]!.b) lo = mid + 1;
      else { idx = mid; break; }
    }
    if (idx >= 0) {
      pages[idx]!++;
      sets[idx]!.add(r.vid);
    }
  }
  const tranches: VisitStats["tranches"] = bounds.map((x, i) => ({ label: x.label, visiteurs: sets[i]!.size, pages: pages[i]!, detail: x.detail }));
  const visitorsTotal = all.size;
  void now;
  const topPages = core.sqlite
    .prepare(`SELECT path, COUNT(*) AS n FROM site_visits WHERE ts >= ? AND ts < ? GROUP BY path ORDER BY n DESC LIMIT 6`)
    .all(from, to) as Array<{ path: string; n: number }>;
  return { visiteurs: visitorsTotal, pages: total, tranches, topPages };
}
