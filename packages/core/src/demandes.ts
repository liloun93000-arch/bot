import { FINE_CATEGORIES, fineCategory, isRealQuestion, looksLikeQuestion } from "./categories";
import type { Core } from "./db";

/**
 * Demandes commerciales par catégorie.
 *
 * Une ligne de la table `questions` n'est une DEMANDE comptée (demande = 1) que si le message exprime une vraie
 * demande ET qu'il n'est pas la simple suite d'une demande déjà comptée pour ce client. Les salutations, les
 * remerciements, les confirmations, les précisions en cours de discussion et les messages répétitifs sont gardés
 * (consultables, jamais supprimés) mais exclus des statistiques, avec la raison de l'exclusion.
 *
 * « Autre » ne contient que de vraies demandes qu'aucune catégorie ne reconnaît : ce n'est PAS la catégorie par défaut
 * d'un message incompris. Tout est déterministe : aucun appel IA, donc aucun crédit consommé.
 */
const DAY = 86_400_000;
/** Un message de la même catégorie, du même client, dans cette fenêtre = suite de la demande déjà comptée. */
export const DEMANDE_WINDOW_MS = DAY;
/** Au-delà, un message sans catégorie propre ne reprend plus la catégorie du client. */
const CONTEXT_WINDOW_MS = 7 * DAY;

export const LEGACY_CATEGORIES = ["Société", "Digital", "China", "Formation"] as const;
export const AUTRE = "Autre";
/** Toutes les catégories proposées pour une correction manuelle. */
export const ALL_CATEGORIES: string[] = [...FINE_CATEGORIES.map((c) => c.label), ...LEGACY_CATEGORIES, AUTRE];

const SOCIETE_RE = /\b(llc|ltd|wyoming|new ?mexico|hong ?kong|soci[ée]t[ée]s?|kbis|siret|siren|\bein\b|cr[ée]er (?:ma|une|mon|un) (?:entreprise|soci[ée]t[ée]|structure)|statut juridique)\b/i;
const DIGITAL_RE = /\b(applications?|apps?|bots?|chatbot|automatisation|logiciel|saas|shopify|woocommerce|e-?commerce|branding|identit[ée] visuelle|marque|packaging|site web|site internet|boutique en ligne|r[ée]f[ée]rencement|seo)\b/i;

/** Catégorie portée par le message lui-même (catégories précises, puis Société / Digital), ou null. */
export function categoryOfText(text: string): string | null {
  const t = text.normalize("NFC");
  const fine = fineCategory(t);
  if (fine) return fine;
  if (SOCIETE_RE.test(t)) return "Société";
  if (DIGITAL_RE.test(t)) return "Digital";
  return null;
}

/** Question générique qui porte sur « ça » (prix, délai, dispo…) : elle reprend le sujet de la demande en cours. */
const FOLLOWUP_RE = /\b(prix|combien|tarifs?|dispo|disponibles?|stock|delais?|d[ée]lais?|livraison|paiements?|payer|comment|quand|[çc]a co[uû]te|c.est quoi|infos?|d[ée]tails?|photos?|vid[ée]os?)\b/i;

const MARKER_ONLY_RE = /^\s*\[[^\]]*\]\s*$/;
const THANKS_RE = /\b(merci|remercie|thanks|thank you|mrc)\b/i;

export type DemandeClassification = {
  categorie: string;
  demande: boolean;
  raison: string;
};

export interface ClassifyInput {
  waId: string;
  texte: string;
  ts: number;
  /** Ligne en cours de recalcul (exclue de la recherche de doublons). */
  excludeId?: number;
  /** Catégorie du service en cours (repli en dernier recours, uniquement en direct). */
  serviceCategorie?: string | null;
}

/** Classe UN message client. N'écrit rien. */
export function classifyDemande(core: Core, input: ClassifyInput): DemandeClassification {
  const text = input.texte.trim();
  const direct = categoryOfText(text);

  if (!text || MARKER_ONLY_RE.test(text)) {
    return { categorie: direct ?? AUTRE, demande: false, raison: "Pièce jointe sans texte : aucune demande identifiable" };
  }
  if (!isRealQuestion(text)) {
    return { categorie: direct ?? AUTRE, demande: false, raison: "Salutation, politesse ou confirmation simple" };
  }
  const isAsk = looksLikeQuestion(text);
  if (!isAsk && !direct && THANKS_RE.test(text)) {
    return { categorie: AUTRE, demande: false, raison: "Remerciement" };
  }

  const recent = core.sqlite
    .prepare(
      `SELECT id, categorie, normalise, created_at FROM questions
       WHERE wa_id = ? AND demande = 1 AND created_at < ? AND created_at >= ? AND id <> ? ORDER BY created_at DESC`,
    )
    .all(input.waId, input.ts, input.ts - CONTEXT_WINDOW_MS, input.excludeId ?? -1) as Array<{
    id: number; categorie: string; normalise: string; created_at: number;
  }>;
  const context = recent.find((r) => r.categorie !== AUTRE)?.categorie ?? null;

  // Un message court qui ne fait que prolonger la discussion (réponse à une question du bot, précision)
  // n'est pas une nouvelle demande : on regarde le contexte avant de décider.
  if (!isAsk && !direct) {
    return {
      categorie: context ?? AUTRE,
      demande: false,
      raison: recent.length > 0 ? "Précision ou suite d'une demande déjà comptée" : "Message sans demande identifiable",
    };
  }

  // Sans catégorie propre : une question générique (« et le prix ? ») reprend le sujet en cours ; une question
  // sur un tout autre sujet reste une demande « Autre » à part entière.
  const followUp = !direct && FOLLOWUP_RE.test(text);
  const categorie = direct ?? (followUp ? (context ?? input.serviceCategorie ?? AUTRE) : AUTRE);
  const doublon = recent.find((r) => r.categorie === categorie && input.ts - r.created_at < DEMANDE_WINDOW_MS);
  if (doublon) {
    return { categorie, demande: false, raison: `Suite d'une demande « ${categorie} » déjà comptée (n° ${doublon.id})` };
  }
  return { categorie, demande: true, raison: "" };
}

export interface ReclassifySummary {
  total: number;
  comptees: number;
  exclues: number;
  recategorisees: number;
  manuelles: number;
}

/**
 * Recalcule les anciennes lignes (ordre chronologique par client) à partir du texte conservé. Sans appel IA, sans
 * suppression de conversation ni de ligne. Les catégories corrigées à la main ne sont jamais modifiées.
 */
export function reclassifyQuestions(core: Core): ReclassifySummary {
  const rows = core.sqlite
    .prepare(`SELECT id, wa_id, texte, categorie, categorie_manuelle, demande, created_at FROM questions ORDER BY wa_id, created_at, id`)
    .all() as Array<{ id: number; wa_id: string; texte: string; categorie: string; categorie_manuelle: number; demande: number; created_at: number }>;
  const out: ReclassifySummary = { total: rows.length, comptees: 0, exclues: 0, recategorisees: 0, manuelles: 0 };
  const upd = core.sqlite.prepare(`UPDATE questions SET categorie = ?, categorie_auto = ?, demande = ?, raison = ? WHERE id = ?`);
  const updAuto = core.sqlite.prepare(`UPDATE questions SET categorie_auto = ?, demande = ?, raison = ? WHERE id = ?`);
  for (const r of rows) {
    const c = classifyDemande(core, { waId: r.wa_id, texte: r.texte, ts: r.created_at, excludeId: r.id });
    if (r.categorie_manuelle === 1) {
      // Catégorie choisie par un administrateur : conservée. Le statut « demande » suit toujours la même règle.
      updAuto.run(c.categorie, c.demande ? 1 : 0, c.raison, r.id);
      out.manuelles++;
      if (c.demande) out.comptees++;
      else out.exclues++;
      continue;
    }
    if (c.categorie !== r.categorie) out.recategorisees++;
    upd.run(c.categorie, c.categorie, c.demande ? 1 : 0, c.raison, r.id);
    if (c.demande) out.comptees++;
    else out.exclues++;
  }
  return out;
}

// ── Lecture ──

export interface CategoryCount {
  categorie: string;
  n: number;
}

/** Demandes comptées par catégorie (mêmes lignes que celles consultables dans le détail). */
export function categoryCounts(core: Core, from: number, to: number): CategoryCount[] {
  return core.sqlite
    .prepare(
      `SELECT categorie, COUNT(*) AS n FROM questions WHERE demande = 1 AND created_at >= ? AND created_at < ?
       GROUP BY categorie ORDER BY n DESC, categorie ASC`,
    )
    .all(from, to) as CategoryCount[];
}

export interface ContextMessage {
  role: string;
  contenu: string;
  ts: number;
}

export interface DemandeItem {
  id: number;
  waId: string;
  nom: string | null;
  ts: number;
  texte: string;
  categorie: string;
  categorieAuto: string;
  manuelle: boolean;
  demande: boolean;
  raison: string;
  /** Messages qui précèdent la demande, puis la réponse qui a suivi : de quoi comprendre le classement. */
  avant: ContextMessage[];
  apres: ContextMessage | null;
}

/** Détail d'une catégorie : une ligne par demande, avec le message exact et son contexte. */
export function categoryDetail(
  core: Core,
  categorie: string,
  from: number,
  to: number,
  opts: { exclues?: boolean; limit?: number } = {},
): { total: number; items: DemandeItem[] } {
  const demande = opts.exclues ? 0 : 1;
  const total = (core.sqlite
    .prepare(`SELECT COUNT(*) AS n FROM questions WHERE demande = ? AND categorie = ? AND created_at >= ? AND created_at < ?`)
    .get(demande, categorie, from, to) as { n: number }).n;
  const rows = core.sqlite
    .prepare(
      `SELECT q.id, q.wa_id, c.nom, q.created_at, q.texte, q.categorie, q.categorie_auto, q.categorie_manuelle, q.demande, q.raison
       FROM questions q LEFT JOIN contacts c ON c.wa_id = q.wa_id
       WHERE q.demande = ? AND q.categorie = ? AND q.created_at >= ? AND q.created_at < ?
       ORDER BY q.created_at DESC LIMIT ?`,
    )
    .all(demande, categorie, from, to, opts.limit ?? 200) as Array<{
    id: number; wa_id: string; nom: string | null; created_at: number; texte: string; categorie: string;
    categorie_auto: string; categorie_manuelle: number; demande: number; raison: string;
  }>;
  // La ligne est enregistrée APRÈS la réponse du bot : on retrouve le vrai message du client (celui dont le texte est
  // repris dans la demande) pour montrer ce qui le précède et la réponse qui a suivi.
  const anchorQ = core.sqlite.prepare(
    `SELECT id, ts FROM messages WHERE wa_id = ? AND role = 'user' AND ts <= ? AND ts >= ? AND length(contenu) > 1
       AND instr(?, contenu) > 0 ORDER BY ts DESC, id DESC LIMIT 1`,
  );
  const beforeQ = core.sqlite.prepare(`SELECT role, contenu, ts FROM messages WHERE wa_id = ? AND id < ? ORDER BY id DESC LIMIT 3`);
  const afterQ = core.sqlite.prepare(`SELECT role, contenu, ts FROM messages WHERE wa_id = ? AND id > ? AND role <> 'user' ORDER BY id ASC LIMIT 1`);
  const items = rows.map((r): DemandeItem => {
    const anchor = anchorQ.get(r.wa_id, r.created_at + 60_000, r.created_at - 15 * 60_000, r.texte) as { id: number; ts: number } | undefined;
    return {
      id: r.id,
      waId: r.wa_id,
      nom: r.nom,
      ts: r.created_at,
      texte: r.texte,
      categorie: r.categorie,
      categorieAuto: r.categorie_auto,
      manuelle: r.categorie_manuelle === 1,
      demande: r.demande === 1,
      raison: r.raison,
      avant: anchor ? (beforeQ.all(r.wa_id, anchor.id) as ContextMessage[]).reverse() : [],
      apres: anchor ? ((afterQ.get(r.wa_id, anchor.id) as ContextMessage | undefined) ?? null) : null,
    };
  });
  return { total, items };
}

export function excludedCount(core: Core, from: number, to: number): number {
  return (core.sqlite
    .prepare(`SELECT COUNT(*) AS n FROM questions WHERE demande = 0 AND created_at >= ? AND created_at < ?`)
    .get(from, to) as { n: number }).n;
}

/**
 * Correction manuelle : change la catégorie (et compte la ligne comme demande) ou, avec `categorie = null`, la
 * déclare « pas une demande ». Les statistiques suivent immédiatement (elles lisent la même table).
 */
export function setQuestionCategory(core: Core, id: number, categorie: string | null): boolean {
  if (categorie !== null && !ALL_CATEGORIES.includes(categorie)) return false;
  const res =
    categorie === null
      ? core.sqlite.prepare(`UPDATE questions SET demande = 0, raison = 'Marquée « pas une demande » par un administrateur', categorie_manuelle = 1 WHERE id = ?`).run(id)
      : core.sqlite.prepare(`UPDATE questions SET categorie = ?, demande = 1, raison = '', categorie_manuelle = 1 WHERE id = ?`).run(categorie, id);
  return (res as { changes: number }).changes > 0;
}
