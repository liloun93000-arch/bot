import type { Core } from "@arbi/core";

/**
 * Liens de suivi invisibles (Snapchat, Telegram, Linktree, Site…) : /go/<source> compte le clic
 * puis redirige aussitôt vers WhatsApp, SANS message prérempli.
 *
 * Rattachement clic → client : IMPOSSIBLE de façon fiable avec un lien wa.me sans texte prérempli
 * (WhatsApp ne transmet aucune information sur l'origine au premier message ; seules les publicités
 * « Click-to-WhatsApp » de Meta en transmettent). On ne stocke donc que des CLICS par source, jamais
 * une source par client.
 */

export const DEFAULT_SOURCES = [
  { slug: "snapchat", nom: "Snapchat" },
  { slug: "telegram", nom: "Telegram" },
  { slug: "linktree", nom: "Linktree" },
  { slug: "site", nom: "Site internet" },
];

/** Numéro WhatsApp de destination (le même pour toutes les sources). */
export const WA_DESTINATION = "33756975687";

export interface TrackingSource {
  id: number;
  slug: string;
  nom: string;
  actif: number;
  createdAt: number;
}

const ready = new WeakSet<object>();
export function ensureTracking(core: Core): void {
  if (ready.has(core)) return;
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS tracking_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      nom TEXT NOT NULL,
      actif INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tracking_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      ts INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_tracking_clicks ON tracking_clicks(source_id, ts)`,
  ]) {
    core.sqlite.prepare(sql).run();
  }
  const ins = core.sqlite.prepare(`INSERT OR IGNORE INTO tracking_sources (slug, nom, actif, created_at) VALUES (?, ?, 1, ?)`);
  for (const s of DEFAULT_SOURCES) ins.run(s.slug, s.nom, Date.now());
  ready.add(core);
}

export function listSources(core: Core): TrackingSource[] {
  ensureTracking(core);
  return core.sqlite
    .prepare(`SELECT id, slug, nom, actif, created_at AS createdAt FROM tracking_sources ORDER BY id`)
    .all() as TrackingSource[];
}

export function sourceBySlug(core: Core, slug: string): TrackingSource | undefined {
  ensureTracking(core);
  return core.sqlite
    .prepare(`SELECT id, slug, nom, actif, created_at AS createdAt FROM tracking_sources WHERE slug = ?`)
    .get(slug) as TrackingSource | undefined;
}

export function recordClick(core: Core, sourceId: number, ts = Date.now()): void {
  ensureTracking(core);
  core.sqlite.prepare(`INSERT INTO tracking_clicks (source_id, ts) VALUES (?, ?)`).run(sourceId, ts);
}

export function clicksBySource(core: Core, from: number, to: number): Map<number, number> {
  ensureTracking(core);
  const rows = core.sqlite
    .prepare(`SELECT source_id AS id, COUNT(*) AS n FROM tracking_clicks WHERE ts >= ? AND ts < ? GROUP BY source_id`)
    .all(from, to) as Array<{ id: number; n: number }>;
  return new Map(rows.map((r) => [r.id, r.n]));
}

export function totalClicks(core: Core, sourceId: number): number {
  ensureTracking(core);
  return (core.sqlite.prepare(`SELECT COUNT(*) AS n FROM tracking_clicks WHERE source_id = ?`).get(sourceId) as { n: number }).n;
}

export function slugify(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

/** Aperçus de liens (Snapchat, Telegram, WhatsApp, Facebook…) : ce ne sont pas des clics humains. */
export const BOT_UA_RE =
  /(bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegrambot|snapchat.*(preview|bot)|twitterbot|slackbot|discordbot|linkedinbot|embedly|skypeuripreview|curl|wget|python|headless)/i;
