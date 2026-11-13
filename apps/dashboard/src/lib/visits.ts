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
  tranches: Array<{ label: string; visiteurs: number; pages: number }>;
  topPages: Array<{ path: string; n: number }>;
}

function count(core: Core, from: number, to: number): { v: number; p: number } {
  const r = core.sqlite
    .prepare(`SELECT COUNT(DISTINCT vid) AS v, COUNT(*) AS p FROM site_visits WHERE ts >= ? AND ts < ?`)
    .get(from, to) as { v: number; p: number };
  return { v: r.v, p: r.p };
}

/** Statistiques d'une période : par heure si la période fait un jour, sinon par jour. */
export function visitStats(core: Core, from: number, to: number, now = Date.now()): VisitStats {
  ensure(core);
  const total = count(core, from, to);
  const tranches: VisitStats["tranches"] = [];
  if (to - from <= 26 * 3_600_000) {
    for (let t = from; t < Math.min(to, now); t += 3_600_000) {
      const c = count(core, t, t + 3_600_000);
      tranches.push({ label: new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit" }) + " h", visiteurs: c.v, pages: c.p });
    }
  } else {
    let ymd = parisYmd(from);
    for (let i = 0; i < 400; i++) {
      const a = parisMidnight(ymd);
      if (a >= to) break;
      const b = parisMidnight(parisYmd(a + 36 * 3_600_000));
      const c = count(core, a, Math.min(b, to));
      tranches.push({ label: `${ymd.slice(8)}/${ymd.slice(5, 7)}`, visiteurs: c.v, pages: c.p });
      ymd = parisYmd(b);
    }
  }
  const topPages = core.sqlite
    .prepare(`SELECT path, COUNT(*) AS n FROM site_visits WHERE ts >= ? AND ts < ? GROUP BY path ORDER BY n DESC LIMIT 6`)
    .all(from, to) as Array<{ path: string; n: number }>;
  return { visiteurs: total.v, pages: total.p, tranches, topPages };
}
