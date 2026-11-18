import type { Core } from "./db";

/**
 * Statuts commerciaux des fiches « Clients prêts à acheter ».
 *
 * Évolution automatique par RÈGLES DÉTERMINISTES (aucun appel IA : zéro crédit) :
 * - nouveau → en_cours : le client a répondu après la création de la fiche et le besoin est qualifié ;
 * - → devis_envoye : une vraie proposition (mot « devis » + montant, ou document devis) est partie ;
 * - → perdu : abandon EXPLICITE du client. Le silence ne fait JAMAIS perdre un client ;
 * - perdu → en_cours : le client revient ;
 * - → gagne : jamais déduit d'un message (« je veux payer » n'est pas un paiement). Uniquement
 *   par un administrateur, ou par une donnée de paiement fiable via `confirmLeadWon`.
 *
 * Une correction humaine est respectée : l'IA n'agit ensuite que sur des éléments POSTÉRIEURS.
 * Chaque changement est historisé (ancien, nouveau, date, origine, motif, élément déclencheur).
 */
export const LEAD_STATUTS = ["nouveau", "en_cours", "devis_envoye", "gagne", "perdu"] as const;
export type LeadStatut = (typeof LEAD_STATUTS)[number];

export type LeadOrigine = "ia" | "humain";

export interface LeadStatusChange {
  id: number;
  leadId: number;
  waId: string;
  ancien: string;
  nouveau: string;
  ts: number;
  origine: LeadOrigine;
  motif: string;
  preuve: string;
}

const RANK: Record<LeadStatut, number> = { nouveau: 0, en_cours: 1, devis_envoye: 2, gagne: 3, perdu: -1 };

/** Délai minimal avant que l'IA ne contredise une décision humaine « perdu » (pas d'écrasement immédiat). */
export const HUMAN_PERDU_GRACE_MS = 6 * 60 * 60 * 1000;

function norm(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Abandon explicite du projet (jamais un simple « non merci » à une question annexe). */
const STRONG_REFUSAL_RE =
  /\b(ne m interesse (plus|pas)|plus interesse|pas interesse|j abandonne|je laisse tomber|laisse tomber|je renonce|j annule|annule (ma|la|mon|le)|finalement (non|je (ne )?(prends?|veux|fais) (pas|plus))|je ne (veux|prends|fais) plus|je ne donne pas suite|pas de suite)\b/;
/** Refus bref, valable seulement juste après une proposition (devis envoyé). */
const WEAK_REFUSAL_RE = /^(non( merci)?|non c est bon|c est non|pas pour moi|non finalement|ce sera non)[ .!]*$/;

export function isExplicitRefusal(text: string, afterQuote = false): boolean {
  const t = norm(text.replace(/^\[[^\]]*\]\s*/, ""));
  if (!t) return false;
  if (STRONG_REFUSAL_RE.test(t)) return true;
  return afterQuote && t.split(" ").length <= 6 && WEAK_REFUSAL_RE.test(t);
}

const AMOUNT_RE = /(\d[\d\s.,]*\s?(€|eur\b|euros?))/i;

/** Vraie proposition commerciale : « devis » + montant, ou document dont le nom est un devis. */
export function isQuoteMessage(text: string): boolean {
  if (/^\[(relance|template)/i.test(text)) return false;
  const t = norm(text);
  const doc = /^\[document envoye\s*:\s*([^\]]+)\]/.exec(t);
  if (doc) return /(devis|proposition|proforma|offre)/.test(doc[1] ?? "");
  if (!AMOUNT_RE.test(text)) return false;
  return /\b(devis|proposition commerciale|proposition personnalisee|offre personnalisee|recapitulatif de (ta|votre) (commande|demande))\b/.test(t);
}

/** Message client qui ne dit rien de plus qu'un accusé (« ok », « merci ») : ne compte pas comme un retour. */
function isMeaningfulReturn(text: string): boolean {
  const t = norm(text.replace(/^\[[^\]]*\]\s*/, ""));
  if (/^(stop|arret|desabonne)/.test(t)) return false;
  return t.split(" ").filter((w) => w.length > 1).length >= 2;
}

interface LeadRow {
  id: number;
  wa_id: string;
  offre: string;
  besoin: string | null;
  budget: string | null;
  delai: string | null;
  score: number | null;
  statut: string;
  ts: number;
  statut_origine: string;
  statut_ts: number | null;
}

interface MsgRow {
  id: number;
  role: string;
  contenu: string;
  ts: number;
}

/** Enregistre le changement ET l'historique. Un changement identique est ignoré. */
export function applyLeadStatus(
  core: Core,
  lead: { id: number; waId: string; statut: string },
  nouveau: LeadStatut,
  info: { origine: LeadOrigine; motif: string; preuve?: string },
  now = Date.now(),
): boolean {
  if (lead.statut === nouveau) return false;
  core.sqlite
    .prepare(`UPDATE leads SET statut = ?, statut_origine = ?, statut_ts = ? WHERE id = ?`)
    .run(nouveau, info.origine, now, lead.id);
  core.sqlite
    .prepare(
      `INSERT INTO lead_status_history (lead_id, wa_id, ancien, nouveau, ts, origine, motif, preuve)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(lead.id, lead.waId, lead.statut, nouveau, now, info.origine, info.motif.slice(0, 300), (info.preuve ?? "").slice(0, 300));
  return true;
}

/** Changement fait par un administrateur (menu déroulant) : toujours respecté. */
export function setLeadStatusHuman(core: Core, leadId: number, statut: LeadStatut): boolean {
  const row = core.sqlite.prepare(`SELECT id, wa_id, statut FROM leads WHERE id = ?`).get(leadId) as
    | { id: number; wa_id: string; statut: string }
    | undefined;
  if (!row) return false;
  return applyLeadStatus(core, { id: row.id, waId: row.wa_id, statut: row.statut }, statut, {
    origine: "humain",
    motif: "Modifié manuellement par un administrateur",
  });
}

/**
 * Seul chemin « gagné » automatique : une donnée de paiement FIABLE (source citée).
 * Aucun appelant ne l'utilise à partir d'un simple message client.
 */
export function confirmLeadWon(core: Core, leadId: number, source: string, preuve: string): boolean {
  const row = core.sqlite.prepare(`SELECT id, wa_id, statut FROM leads WHERE id = ?`).get(leadId) as
    | { id: number; wa_id: string; statut: string }
    | undefined;
  if (!row) return false;
  return applyLeadStatus(core, { id: row.id, waId: row.wa_id, statut: row.statut }, "gagne", {
    origine: "ia",
    motif: `Paiement confirmé (${source})`,
    preuve,
  });
}

/** Évalue UNE fiche. Renvoie le changement appliqué, ou null. Aucun envoi, aucun appel IA. */
export function evaluateLead(core: Core, lead: LeadRow, now = Date.now()): LeadStatusChange | null {
  const statut = lead.statut as LeadStatut;
  if (statut === "gagne") return null;
  const since = lead.statut_ts ?? lead.ts;
  const msgs = core.sqlite
    .prepare(`SELECT id, role, contenu, ts FROM messages WHERE wa_id = ? AND ts > ? ORDER BY id`)
    .all(lead.wa_id, since) as MsgRow[];
  const users = msgs.filter((m) => m.role === "user");

  let target: LeadStatut | null = null;
  let motif = "";
  let preuve = "";

  if (statut === "perdu") {
    const grace = lead.statut_origine === "humain" ? HUMAN_PERDU_GRACE_MS : 0;
    const back = users.find((m) => m.ts - since >= grace && !isExplicitRefusal(m.contenu) && isMeaningfulReturn(m.contenu));
    if (back) {
      target = "en_cours";
      motif = "Le client est revenu après avoir abandonné";
      preuve = back.contenu;
    }
  } else {
    // Rien n'est déduit du silence : seuls des messages RÉELS comptent.
    let lastQuoteAt = statut === "devis_envoye" ? since : 0;
    for (const m of msgs) {
      if (m.role === "user") {
        if (isExplicitRefusal(m.contenu, lastQuoteAt > 0)) {
          target = "perdu";
          motif = "Le client a explicitement abandonné ou refusé";
          preuve = m.contenu;
          break;
        }
      } else if (isQuoteMessage(m.contenu)) {
        lastQuoteAt = m.ts;
        if (RANK[statut] < RANK.devis_envoye && target !== "devis_envoye") {
          target = "devis_envoye";
          motif = "Une proposition commerciale chiffrée a été envoyée";
          preuve = m.contenu;
        }
      }
    }
    if (!target && statut === "nouveau") {
      const engaged = users.length > 0 && (lead.besoin || lead.budget || lead.delai || (lead.score ?? 0) >= 3);
      if (engaged) {
        target = "en_cours";
        motif = "Le client a répondu et son besoin est qualifié : discussion commerciale engagée";
        preuve = users[0]?.contenu ?? "";
      }
    }
  }

  if (!target || target === statut) return null;
  // Jamais de régression automatique, sauf abandon explicite (perdu) ou retour d'un client perdu.
  if (target !== "perdu" && statut !== "perdu" && RANK[target] <= RANK[statut]) return null;

  applyLeadStatus(core, { id: lead.id, waId: lead.wa_id, statut: lead.statut }, target, { origine: "ia", motif, preuve }, now);
  return {
    id: 0,
    leadId: lead.id,
    waId: lead.wa_id,
    ancien: statut,
    nouveau: target,
    ts: now,
    origine: "ia",
    motif,
    preuve,
  };
}

const LEAD_COLS = `id, wa_id, offre, besoin, budget, delai, score, statut, ts, statut_origine, statut_ts`;

export function evaluateLeadsFor(core: Core, waId: string, now = Date.now()): LeadStatusChange[] {
  const rows = core.sqlite.prepare(`SELECT ${LEAD_COLS} FROM leads WHERE wa_id = ? ORDER BY id`).all(waId) as LeadRow[];
  return rows.map((r) => evaluateLead(core, r, now)).filter((c): c is LeadStatusChange => c !== null);
}

export function evaluateAllLeads(core: Core, now = Date.now()): number {
  const rows = core.sqlite.prepare(`SELECT ${LEAD_COLS} FROM leads WHERE statut <> 'gagne'`).all() as LeadRow[];
  let n = 0;
  for (const r of rows) if (evaluateLead(core, r, now)) n++;
  return n;
}

export function leadStatusHistory(core: Core, leadId: number): LeadStatusChange[] {
  const rows = core.sqlite
    .prepare(
      `SELECT id, lead_id, wa_id, ancien, nouveau, ts, origine, motif, preuve
       FROM lead_status_history WHERE lead_id = ? ORDER BY id DESC`,
    )
    .all(leadId) as Array<{
    id: number;
    lead_id: number;
    wa_id: string;
    ancien: string;
    nouveau: string;
    ts: number;
    origine: string;
    motif: string;
    preuve: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    leadId: r.lead_id,
    waId: r.wa_id,
    ancien: r.ancien,
    nouveau: r.nouveau,
    ts: r.ts,
    origine: r.origine === "humain" ? "humain" : "ia",
    motif: r.motif,
    preuve: r.preuve,
  }));
}
