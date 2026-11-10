import type { Core } from "@arbi/core";

/**
 * Données de l'accueil (tableau de bord mobile). Lecture seule : aucune
 * écriture, aucune logique métier nouvelle — uniquement des agrégats SQL sur
 * les tables existantes (messages, contacts, questions, alerts).
 */

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const TZ = "Europe/Paris";

export interface Delta {
  /** Pourcentage arrondi, ou null si la période précédente est vide (rien à comparer). */
  pct: number | null;
}

function delta(current: number, previous: number): Delta {
  if (previous === 0) return { pct: current === 0 ? 0 : null };
  return { pct: Math.round(((current - previous) / previous) * 100) };
}

function count(core: Core, sql: string, ...args: number[]): number {
  return (core.sqlite.prepare(sql).get(...args) as { n: number }).n;
}

export interface HomeStats {
  conversationsActives: { value: number; delta: Delta };
  autoReplies: { value: number; delta: Delta };
  photos: { value: number; delta: Delta };
}

/** Compteurs sur 7 jours glissants, comparés aux 7 jours précédents. */
export function homeStats(core: Core): HomeStats {
  const now = Date.now();
  const a = now - WEEK;
  const b = now - 2 * WEEK;

  const convSql = `SELECT COUNT(DISTINCT wa_id) AS n FROM messages WHERE ts >= ? AND ts < ?`;
  const replySql = `SELECT COUNT(*) AS n FROM messages WHERE role = 'assistant' AND ts >= ? AND ts < ?`;
  const photoSql = `SELECT COUNT(*) AS n FROM messages WHERE role = 'user' AND media_type = 'image' AND ts >= ? AND ts < ?`;

  const future = now + DAY;
  const conv = count(core, convSql, a, future);
  const convPrev = count(core, convSql, b, a);
  const rep = count(core, replySql, a, future);
  const repPrev = count(core, replySql, b, a);
  const pho = count(core, photoSql, a, future);
  const phoPrev = count(core, photoSql, b, a);

  return {
    conversationsActives: { value: conv, delta: delta(conv, convPrev) },
    autoReplies: { value: rep, delta: delta(rep, repPrev) },
    photos: { value: pho, delta: delta(pho, phoPrev) },
  };
}

export interface RecentConversation {
  waId: string;
  nom: string;
  initiale: string;
  extrait: string;
  heure: string;
  /** Messages du client restés sans réponse (bot ou Jacob). */
  nonLus: number;
  /** Photos reçues dans cette série de messages sans réponse. */
  photos: number;
  /** Conversation qui attend une action (alerte ouverte ou message non traité). */
  chaude: boolean;
}

function labelOf(nom: string | null, waId: string): string {
  const clean = (nom ?? "").trim();
  if (clean) return clean;
  return waId.length > 6 ? `+${waId.slice(0, 2)} … ${waId.slice(-3)}` : `+${waId}`;
}

/** « 19:12 » aujourd'hui, « hier », puis « 03/11 » — heure de Paris. */
export function shortTime(ts: number, now = Date.now()): string {
  const fmtDay = (t: number) => new Date(t).toLocaleDateString("fr-FR", { timeZone: TZ });
  if (fmtDay(ts) === fmtDay(now)) {
    return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  }
  if (fmtDay(ts) === fmtDay(now - DAY)) return "Hier";
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: TZ });
}

export function recentConversations(core: Core, limit = 3): RecentConversation[] {
  const rows = core.conversationOverview().slice(0, limit);
  const lastReplySql = `SELECT COALESCE(MAX(id), 0) AS n FROM messages WHERE wa_id = ? AND role <> 'user'`;
  const pendingSql = `SELECT COUNT(*) AS n, SUM(CASE WHEN media_type = 'image' THEN 1 ELSE 0 END) AS p
                      FROM messages WHERE wa_id = ? AND role = 'user' AND id > ?`;
  return rows.map((r) => {
    const lastReply = (core.sqlite.prepare(lastReplySql).get(r.waId) as { n: number }).n;
    const pending = core.sqlite.prepare(pendingSql).get(r.waId, lastReply) as { n: number; p: number | null };
    const nom = labelOf(r.nom, r.waId);
    const extrait = r.dernierMessage.replace(/^\[[^\]]*\]\s*/, "").trim() || r.dernierMessage;
    return {
      waId: r.waId,
      nom,
      initiale: (nom.replace(/^\+/, "").trim()[0] ?? "?").toUpperCase(),
      extrait: extrait.slice(0, 120),
      heure: shortTime(r.dernierTs),
      nonLus: pending.n,
      photos: pending.p ?? 0,
      chaude: r.alertesOuvertes > 0 || pending.n > 0,
    };
  });
}

export interface ThemeCount {
  nom: string;
  /** Clients DISTINCTS classés dans ce thème (pas le nombre de messages). */
  clients: number;
}

/** Thèmes (sujets des questions) avec le nombre de clients associés. */
export function themeCounts(core: Core, limit = 4): ThemeCount[] {
  const bySujet = core.sqlite
    .prepare(
      `SELECT sujet AS nom, COUNT(DISTINCT wa_id) AS clients
       FROM questions WHERE sujet <> ''
       GROUP BY sujet ORDER BY clients DESC, nom ASC LIMIT ?`,
    )
    .all(limit) as ThemeCount[];
  if (bySujet.length > 0) return bySujet;
  // Le classement par sujets n'a pas encore tourné : repli sur les catégories.
  return core.sqlite
    .prepare(
      `SELECT categorie AS nom, COUNT(DISTINCT wa_id) AS clients
       FROM questions GROUP BY categorie ORDER BY clients DESC, nom ASC LIMIT ?`,
    )
    .all(limit) as ThemeCount[];
}

export interface ClientPhoto {
  file: string;
  nom: string;
  waId: string;
  quand: string;
}

/** Photos récentes envoyées par les clients (fichiers réellement archivés). */
export function clientPhotos(core: Core, limit = 8, offset = 0): ClientPhoto[] {
  const rows = core.sqlite
    .prepare(
      `SELECT m.media_file AS file, m.wa_id AS waId, m.ts AS ts, c.nom AS nom
       FROM messages m LEFT JOIN contacts c ON c.wa_id = m.wa_id
       WHERE m.role = 'user' AND m.media_type = 'image' AND m.media_file <> ''
       ORDER BY m.id DESC LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as Array<{ file: string; waId: string; ts: number; nom: string | null }>;
  return rows.map((r) => ({
    file: r.file,
    waId: r.waId,
    nom: labelOf(r.nom, r.waId),
    quand: `${shortTime(r.ts)}`,
  }));
}

export function countClientPhotos(core: Core): number {
  const row = core.sqlite
    .prepare(`SELECT COUNT(*) AS n FROM messages WHERE role = 'user' AND media_type = 'image' AND media_file <> ''`)
    .get() as { n: number };
  return row.n;
}
