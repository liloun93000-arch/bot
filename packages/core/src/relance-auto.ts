import type { Core } from "./db";
import { categoryOfText } from "./demandes";
import { isExplicitRefusal } from "./lead-status";
import { SERVICE_WINDOW_MS } from "./whatsapp";

/**
 * Relance automatique d'un client silencieux.
 *
 * Principes (aucun appel IA ici : le texte est produit côté bot, uniquement au moment d'envoyer) :
 * - UNE relance par situation = par dernier message sortant resté sans réponse (index unique wa_id + base_msg_id) ;
 * - la relance n'est jamais une « nouvelle situation » : tant que le client ne répond pas et que
 *   personne ne réécrit, aucune seconde relance ;
 * - annulée dès que le client répond ; réévaluée au moment de l'envoi (jamais sur une donnée périmée) ;
 * - ignore : STOP, mode humain / alerte en attente de Jacob, refus, fiche gagnée ou perdue,
 *   conversation terminée, conversation trop ancienne (évite un envoi massif à l'activation) ;
 * - respecte les heures calmes et la fenêtre WhatsApp de 24 h.
 */

/** Une relance n'est plus envoyée si le silence dépasse le délai de plus de cette durée (pas d'envoi massif à l'activation). */
export const RELANCE_MAX_RETARD_MS = 48 * 60 * 60 * 1000;
const H = 3_600_000;

export type RelanceStatut = "planifiee" | "envoyee" | "annulee" | "ignoree" | "echec";

export interface RelanceConfig {
  actif: boolean;
  delaiMs: number;
  heureDebut: number;
  heureFin: number;
  fuseau: string;
  templateHorsFenetre: boolean;
  templateName: string;
  personnaliser: boolean;
}

export function relanceConfig(core: Core): RelanceConfig {
  const delaiH = Number(core.settings.get("relance_auto_delai_h"));
  const clampH = (v: unknown, def: number): number => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(24, Math.max(0, n)) : def;
  };
  return {
    actif: core.settings.get("relance_auto_actif") === true,
    delaiMs: (Number.isFinite(delaiH) ? Math.min(168, Math.max(1, delaiH)) : 12) * H,
    heureDebut: clampH(core.settings.get("relance_auto_heure_debut"), 9),
    heureFin: clampH(core.settings.get("relance_auto_heure_fin"), 20),
    fuseau: String(core.settings.get("relance_auto_fuseau") || "Europe/Paris"),
    templateHorsFenetre: core.settings.get("relance_auto_template_hors_fenetre") !== false,
    templateName: String(core.settings.get("relance_template_name") ?? "").trim(),
    personnaliser: core.settings.get("relance_auto_personnaliser") !== false,
  };
}

/** Heure locale (0-23) dans le fuseau demandé ; en cas de fuseau invalide, Europe/Paris. */
export function localHour(ts: number, fuseau: string): number {
  for (const tz of [fuseau, "Europe/Paris"]) {
    try {
      const h = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date(ts));
      return Number(h) % 24;
    } catch {
      /* fuseau invalide : on essaie le suivant */
    }
  }
  return new Date(ts).getUTCHours();
}

/** true si l'heure tombe dans la plage d'envoi autorisée (début inclus, fin exclue ; début = fin → tout le temps). */
export function isSendingHour(ts: number, cfg: Pick<RelanceConfig, "heureDebut" | "heureFin" | "fuseau">): boolean {
  const { heureDebut: a, heureFin: b } = cfg;
  if (a === b) return true;
  const h = localHour(ts, cfg.fuseau);
  return a < b ? h >= a && h < b : h >= a || h < b;
}

function norm(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Message de clôture du client (« merci, c'est parfait ») : la conversation est terminée, pas en attente. */
const CLOSING_RE =
  /^(ok |okay |d accord |dac |parfait |super |top |nickel |tres bien |bien |c est bon )*(merci( beaucoup| bcp)?|mrc|thanks|a bientot|bonne (journee|soiree|continuation)|c est bon|ca marche|ok|parfait|nickel|top|super)( .{0,20})?[ .!]*$/;

export function isClosingMessage(text: string): boolean {
  const t = norm(text.replace(/^\[[^\]]*\]\s*/, ""));
  return t.length > 0 && t.split(" ").length <= 7 && CLOSING_RE.test(t);
}

interface LastMsg {
  id: number;
  role: string;
  contenu: string;
  ts: number;
}

export type RelanceSkip =
  | "opt_out"
  | "mode_humain"
  | "alerte_ouverte"
  | "aucun_message_client"
  | "client_a_repondu"
  | "dernier_message_relance"
  | "refus_client"
  | "fiche_terminee"
  | "conversation_terminee"
  | "pas_encore"
  | "trop_ancienne"
  | "deja_relancee"
  | "inactif"
  | "sans_interet";

export interface RelanceCandidate {
  waId: string;
  baseMsgId: number;
  baseTs: number;
}

export interface RelanceVerdict {
  ok: boolean;
  reason?: RelanceSkip;
  candidate?: RelanceCandidate;
}

export interface RelanceContext {
  pertinent: boolean;
  /** Pourquoi la relance est (ou n'est pas) pertinente — lisible dans le suivi. */
  raison: string;
  /** « question » = notre dernière question de qualification est restée sans réponse ; « interet » = intérêt déjà montré. */
  type: "question" | "interet" | "aucun";
  service: string | null;
  statutLead: string | null;
  derniersEchanges: Array<{ role: "user" | "assistant" | "human"; texte: string }>;
  dernierClient: string;
  dernierNous: string;
  questionEnAttente: string | null;
  faits: string[];
  relancesPrecedentes: string[];
}

/**
 * Analyse déterministe (sans IA) de la conversation : sujet, avancement, dernière question posée, intérêt.
 * Sert au filtre de pertinence ET de matière au texte personnalisé.
 */
export function relanceContext(core: Core, waId: string): RelanceContext {
  const hist = core.messages.history(waId, 14) as Array<{ role: string; contenu: string; id: number }>;
  const skip = relanceMsgIds(core, waId);
  const real = hist.filter((m) => !skip.has(m.id) && !/^\[Relance automatique/i.test(m.contenu));
  const echanges = real.map((m) => ({ role: m.role as "user" | "assistant" | "human", texte: String(m.contenu).slice(0, 400) }));
  const clientMsgs = real.filter((m) => m.role === "user");
  const dernierClient = clientMsgs.length ? String(clientMsgs[clientMsgs.length - 1]!.contenu) : "";
  const nous = real.filter((m) => m.role !== "user");
  const dernierNous = nous.length ? String(nous[nous.length - 1]!.contenu) : "";
  const service = core.state.get(waId).serviceEnCours ?? null;
  const lead = core.sqlite.prepare(`SELECT statut FROM leads WHERE wa_id = ? ORDER BY id DESC LIMIT 1`).get(waId) as { statut: string } | undefined;
  const statutLead = lead?.statut ?? null;
  const questionEnAttente = dernierNous.includes("?") ? dernierNous.slice(Math.max(0, dernierNous.lastIndexOf("?", dernierNous.length) - 220), dernierNous.lastIndexOf("?") + 1).trim() : null;
  const interet = Boolean(statutLead) || Boolean(service) || clientMsgs.some((m) => categoryOfText(String(m.contenu)) !== null);
  const type: RelanceContext["type"] = interet ? "interet" : questionEnAttente ? "question" : "aucun";
  const faits = core.facts.actifs(waId, 10).map((f) => f.fait.slice(0, 200));
  const precedentes = core.sqlite.prepare(`SELECT texte FROM auto_relances WHERE wa_id = ? AND texte <> '' ORDER BY id DESC LIMIT 3`).all(waId) as Array<{ texte: string }>;
  return {
    pertinent: type !== "aucun",
    raison: type === "interet" ? "Intérêt déjà montré (sujet, fiche ou demande précise)" : type === "question" ? "Notre dernière question de qualification est restée sans réponse" : "Aucun intérêt ni question en attente",
    type, service, statutLead, derniersEchanges: echanges, dernierClient, dernierNous, questionEnAttente, faits,
    relancesPrecedentes: precedentes.map((r) => r.texte),
  };
}

/** Ids de messages qui SONT des relances automatiques envoyées (pour ne jamais les prendre pour une base). */
function relanceMsgIds(core: Core, waId: string): Set<number> {
  const rows = core.sqlite
    .prepare(`SELECT msg_id FROM auto_relances WHERE wa_id = ? AND msg_id IS NOT NULL`)
    .all(waId) as Array<{ msg_id: number }>;
  return new Set(rows.map((r) => r.msg_id));
}

/**
 * Décide si ce contact doit être relancé MAINTENANT (hors heures calmes et fenêtre 24 h, vérifiées à part).
 * Fonction pure sur la base : aucun envoi.
 */
export function evaluateRelanceEligibility(core: Core, waId: string, now: number, cfg: RelanceConfig): RelanceVerdict {
  const contact = core.sqlite
    .prepare(`SELECT opt_out, mode_humain FROM contacts WHERE wa_id = ?`)
    .get(waId) as { opt_out: number; mode_humain: number } | undefined;
  if (!contact || contact.opt_out) return { ok: false, reason: "opt_out" };
  if (contact.mode_humain) return { ok: false, reason: "mode_humain" };
  if (core.alerts.hasOpenFor(waId)) return { ok: false, reason: "alerte_ouverte" };

  const last = core.sqlite
    .prepare(`SELECT id, role, contenu, ts FROM messages WHERE wa_id = ? ORDER BY id DESC LIMIT 1`)
    .get(waId) as LastMsg | undefined;
  if (!last) return { ok: false, reason: "aucun_message_client" };
  if (last.role === "user") return { ok: false, reason: "client_a_repondu" };
  if (relanceMsgIds(core, waId).has(last.id)) return { ok: false, reason: "dernier_message_relance" };

  const lastUser = core.sqlite
    .prepare(`SELECT contenu, ts FROM messages WHERE wa_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1`)
    .get(waId) as { contenu: string; ts: number } | undefined;
  if (!lastUser) return { ok: false, reason: "aucun_message_client" };

  const dejaFaite = core.sqlite
    .prepare(`SELECT 1 FROM auto_relances WHERE wa_id = ? AND base_msg_id = ? AND statut IN ('envoyee','echec')`)
    .get(waId, last.id);
  if (dejaFaite) return { ok: false, reason: "deja_relancee" };

  // Fiche commerciale terminée : gagnée (payée) ou perdue → on ne relance plus.
  const lead = core.sqlite
    .prepare(`SELECT statut FROM leads WHERE wa_id = ? ORDER BY id DESC LIMIT 1`)
    .get(waId) as { statut: string } | undefined;
  if (lead && (lead.statut === "gagne" || lead.statut === "perdu")) return { ok: false, reason: "fiche_terminee" };

  if (isExplicitRefusal(lastUser.contenu, true)) return { ok: false, reason: "refus_client" };
  // Le client a clos l'échange (« merci ») et notre dernier message n'attendait aucune réponse.
  if (isClosingMessage(lastUser.contenu) && !last.contenu.includes("?")) return { ok: false, reason: "conversation_terminee" };

  // Pertinence : on ne relance que s'il y a un intérêt montré ou une question de qualification restée sans réponse.
  if (!relanceContext(core, waId).pertinent) return { ok: false, reason: "sans_interet" };

  const silence = now - last.ts;
  if (silence < cfg.delaiMs) return { ok: false, reason: "pas_encore" };
  if (silence > cfg.delaiMs + RELANCE_MAX_RETARD_MS) return { ok: false, reason: "trop_ancienne" };

  return { ok: true, candidate: { waId, baseMsgId: last.id, baseTs: last.ts } };
}

/** true si le client peut encore recevoir un texte libre (fenêtre de service de 24 h ouverte). */
export function windowOpen(core: Core, waId: string, now: number): boolean {
  const last = core.messages.lastInboundTs(waId);
  return last !== null && now - last <= SERVICE_WINDOW_MS;
}

/**
 * Planifie les relances : une ligne « planifiee » par situation éligible (ou qui le deviendra) et
 * annule les planifiées devenues caduques. Idempotent. Aucun envoi.
 */
export function planRelances(core: Core, now: number = Date.now()): { planifiees: number; annulees: number } {
  const cfg = relanceConfig(core);
  let annulees = 0;
  let planifiees = 0;
  if (!cfg.actif) return { planifiees, annulees };

  // Dernier message de chaque conversation récente, quand il est sortant.
  const since = now - cfg.delaiMs - RELANCE_MAX_RETARD_MS;
  const rows = core.sqlite
    .prepare(
      `SELECT m.wa_id, m.id, m.role, m.ts FROM messages m
       JOIN (SELECT wa_id, MAX(id) AS mid FROM messages GROUP BY wa_id) x ON x.mid = m.id
       WHERE m.ts >= ?`,
    )
    .all(since) as Array<{ wa_id: string; id: number; role: string; ts: number }>;

  const insert = core.sqlite.prepare(
    `INSERT OR IGNORE INTO auto_relances (wa_id, base_msg_id, base_ts, scheduled_for, statut, created_at)
     VALUES (?, ?, ?, ?, 'planifiee', ?)`,
  );
  const reschedule = core.sqlite.prepare(`UPDATE auto_relances SET scheduled_for = ? WHERE id = ? AND statut = 'planifiee'`);

  for (const r of rows) {
    if (r.role === "user") continue;
    // On évalue « comme si le délai était écoulé » pour savoir si une relance est envisageable.
    const verdict = evaluateRelanceEligibility(core, r.wa_id, r.ts + cfg.delaiMs, cfg);
    if (!verdict.ok || !verdict.candidate) continue;
    const res = insert.run(r.wa_id, r.id, r.ts, r.ts + cfg.delaiMs, now) as { changes: number };
    if (res.changes > 0) planifiees++;
    else {
      const existing = core.sqlite
        .prepare(`SELECT id FROM auto_relances WHERE wa_id = ? AND base_msg_id = ? AND statut = 'planifiee'`)
        .get(r.wa_id, r.id) as { id: number } | undefined;
      if (existing) reschedule.run(r.ts + cfg.delaiMs, existing.id);
    }
  }

  // Les planifiées dont la base n'est plus le dernier message (client répondu, Jacob écrit…) sont annulées.
  const pending = core.sqlite
    .prepare(`SELECT id, wa_id, base_msg_id FROM auto_relances WHERE statut = 'planifiee'`)
    .all() as Array<{ id: number; wa_id: string; base_msg_id: number }>;
  for (const p of pending) {
    const last = core.sqlite.prepare(`SELECT MAX(id) AS id FROM messages WHERE wa_id = ?`).get(p.wa_id) as { id: number | null };
    if (last.id !== p.base_msg_id) {
      closeRelance(core, p.id, "annulee", "Le client ou un administrateur a écrit depuis", now);
      annulees++;
    }
  }
  return { planifiees, annulees };
}

export function closeRelance(core: Core, id: number, statut: RelanceStatut, motif: string, now = Date.now()): void {
  core.sqlite.prepare(`UPDATE auto_relances SET statut = ?, motif = ?, closed_at = ? WHERE id = ?`).run(statut, motif.slice(0, 300), now, id);
}

/** À appeler quand un message du client arrive : annule les relances en attente et rattache la réponse à la dernière relance envoyée. */
export function onClientMessage(core: Core, waId: string, ts: number = Date.now(), msgId?: number): void {
  core.sqlite
    .prepare(`UPDATE auto_relances SET statut = 'annulee', motif = 'Le client a répondu', closed_at = ? WHERE wa_id = ? AND statut = 'planifiee'`)
    .run(ts, waId);
  core.sqlite
    .prepare(
      `UPDATE auto_relances SET reply_at = ?, reply_msg_id = ?
       WHERE id = (SELECT id FROM auto_relances WHERE wa_id = ? AND statut = 'envoyee' AND reply_at IS NULL AND sent_at IS NOT NULL AND sent_at <= ?
                   ORDER BY sent_at DESC LIMIT 1)`,
    )
    .run(ts, msgId ?? lastUserMsgId(core, waId), waId, ts);
}

function lastUserMsgId(core: Core, waId: string): number | null {
  const r = core.sqlite.prepare(`SELECT MAX(id) AS id FROM messages WHERE wa_id = ? AND role = 'user'`).get(waId) as { id: number | null };
  return r.id;
}

export interface DueRelance {
  id: number;
  waId: string;
  candidate: RelanceCandidate;
  /** Texte libre autorisé (fenêtre 24 h ouverte) ou template. */
  canal: "libre" | "template";
}

/**
 * Relances à envoyer maintenant, déjà revalidées (éligibilité, heures calmes, fenêtre 24 h).
 * Celles qui ne peuvent plus l'être sont clôturées avec leur motif ; celles qui doivent juste attendre restent planifiées.
 */
export function dueRelances(core: Core, now: number = Date.now(), limit = 5): DueRelance[] {
  const cfg = relanceConfig(core);
  if (!cfg.actif) return [];
  const rows = core.sqlite
    .prepare(`SELECT id, wa_id, base_msg_id FROM auto_relances WHERE statut = 'planifiee' AND scheduled_for <= ? ORDER BY scheduled_for LIMIT ?`)
    .all(now, limit * 4) as Array<{ id: number; wa_id: string; base_msg_id: number }>;
  const out: DueRelance[] = [];
  for (const r of rows) {
    if (out.length >= limit) break;
    const verdict = evaluateRelanceEligibility(core, r.wa_id, now, cfg);
    if (!verdict.ok || !verdict.candidate || verdict.candidate.baseMsgId !== r.base_msg_id) {
      if (verdict.reason === "pas_encore") continue; // délai rallongé dans les réglages : on attend
      closeRelance(core, r.id, verdict.reason === "client_a_repondu" ? "annulee" : "ignoree", motifOf(verdict.reason), now);
      continue;
    }
    if (!isSendingHour(now, cfg)) continue; // heures calmes : on reporte, sans annuler
    if (windowOpen(core, r.wa_id, now)) {
      out.push({ id: r.id, waId: r.wa_id, candidate: verdict.candidate, canal: "libre" });
    } else if (cfg.templateHorsFenetre && cfg.templateName) {
      out.push({ id: r.id, waId: r.wa_id, candidate: verdict.candidate, canal: "template" });
    } else {
      closeRelance(core, r.id, "ignoree", "Fenêtre WhatsApp de 24 h fermée et aucun template de relance disponible", now);
    }
  }
  return out;
}

export function motifOf(reason: RelanceSkip | undefined): string {
  switch (reason) {
    case "opt_out": return "Le client a demandé l'arrêt des messages (STOP)";
    case "mode_humain": return "Conversation prise en main par un administrateur";
    case "alerte_ouverte": return "Alerte ouverte : en attente de Jacob";
    case "aucun_message_client": return "Le client n'a jamais écrit";
    case "client_a_repondu": return "Le client a répondu";
    case "dernier_message_relance": return "Déjà relancé pour cette situation";
    case "refus_client": return "Le client a refusé ou abandonné";
    case "fiche_terminee": return "Fiche commerciale gagnée ou perdue";
    case "conversation_terminee": return "Conversation terminée par le client";
    case "trop_ancienne": return "Conversation trop ancienne pour être relancée automatiquement";
    case "deja_relancee": return "Déjà relancé pour cette situation";
    case "inactif": return "Relance automatique désactivée";
    case "sans_interet": return "Aucun intérêt commercial ni question en attente : relance inutile";
    default: return "Non éligible";
  }
}

/** Enregistre l'envoi (ou l'échec) d'une relance. Le message est inscrit dans la conversation, rattaché à la relance. */
export function recordRelanceSent(
  core: Core,
  id: number,
  info: { texte: string; canal: "libre" | "template"; wamid?: string | null; stored: string },
  now: number = Date.now(),
): void {
  const waId = (core.sqlite.prepare(`SELECT wa_id FROM auto_relances WHERE id = ?`).get(id) as { wa_id: string }).wa_id;
  const msgId = core.messages.insert(waId, "assistant", info.stored, info.wamid ?? null, now);
  core.sqlite
    .prepare(`UPDATE auto_relances SET statut = 'envoyee', texte = ?, canal = ?, msg_id = ?, wamid = ?, sent_at = ?, closed_at = ?, motif = '' WHERE id = ?`)
    .run(info.texte.slice(0, 1000), info.canal, msgId, info.wamid ?? null, now, now, id);
}

export function recordRelanceFailure(core: Core, id: number, reason: string, now = Date.now()): void {
  closeRelance(core, id, "echec", `Envoi impossible : ${reason}`, now);
}

// ── Affichage et efficacité ──

export interface RelanceRow {
  id: number;
  waId: string;
  nom: string | null;
  statut: RelanceStatut;
  motif: string;
  texte: string;
  canal: string;
  scheduledFor: number;
  sentAt: number | null;
  replyAt: number | null;
  replyText: string | null;
  wamid: string | null;
  deliveryStatus: string | null;
}

export function listRelances(core: Core, limit = 100): RelanceRow[] {
  const rows = core.sqlite
    .prepare(
      `SELECT r.id, r.wa_id, c.nom, r.statut, r.motif, r.texte, r.canal, r.scheduled_for, r.sent_at, r.reply_at, r.wamid,
              (SELECT contenu FROM messages WHERE id = r.reply_msg_id) AS reply_text,
              (SELECT status FROM message_delivery WHERE wamid = r.wamid) AS delivery_status
       FROM auto_relances r LEFT JOIN contacts c ON c.wa_id = r.wa_id
       ORDER BY COALESCE(r.sent_at, r.scheduled_for) DESC LIMIT ?`,
    )
    .all(limit) as Array<{
    id: number; wa_id: string; nom: string | null; statut: string; motif: string; texte: string; canal: string;
    scheduled_for: number; sent_at: number | null; reply_at: number | null; wamid: string | null;
    reply_text: string | null; delivery_status: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id, waId: r.wa_id, nom: r.nom, statut: r.statut as RelanceStatut, motif: r.motif, texte: r.texte, canal: r.canal,
    scheduledFor: r.scheduled_for, sentAt: r.sent_at, replyAt: r.reply_at, replyText: r.reply_text, wamid: r.wamid,
    deliveryStatus: r.delivery_status,
  }));
}

export interface RelanceStats {
  planifiees: number;
  envoyees: number;
  annulees: number;
  ignorees: number;
  echecs: number;
  lues: number;
  reponses: number;
  /** Réponses / relances envoyées (0-1), ou null sans envoi. */
  tauxReponse: number | null;
  /** Clients relancés dont la fiche a progressé (devis envoyé ou gagné) APRÈS la relance. */
  conversions: number;
}

/** Statistiques réelles (relances effectivement envoyées et réponses reçues). `since` = début de période en ms. */
export function relanceStats(core: Core, since = 0): RelanceStats {
  const count = (statut: string): number =>
    (core.sqlite.prepare(`SELECT COUNT(*) AS n FROM auto_relances WHERE statut = ? AND COALESCE(sent_at, closed_at, scheduled_for) >= ?`).get(statut, since) as { n: number }).n;
  const envoyees = count("envoyee");
  const reponses = (core.sqlite
    .prepare(`SELECT COUNT(*) AS n FROM auto_relances WHERE statut = 'envoyee' AND reply_at IS NOT NULL AND sent_at >= ?`)
    .get(since) as { n: number }).n;
  const lues = (core.sqlite
    .prepare(
      `SELECT COUNT(*) AS n FROM auto_relances r JOIN message_delivery d ON d.wamid = r.wamid
       WHERE r.statut = 'envoyee' AND r.sent_at >= ? AND d.status = 'read'`,
    )
    .get(since) as { n: number }).n;
  const conversions = (core.sqlite
    .prepare(
      `SELECT COUNT(DISTINCT r.id) AS n FROM auto_relances r
       JOIN lead_status_history h ON h.wa_id = r.wa_id AND h.ts > r.sent_at AND h.nouveau IN ('devis_envoye','gagne')
       WHERE r.statut = 'envoyee' AND r.sent_at >= ? AND r.reply_at IS NOT NULL`,
    )
    .get(since) as { n: number }).n;
  return {
    planifiees: count("planifiee"),
    envoyees,
    annulees: count("annulee"),
    ignorees: count("ignoree"),
    echecs: count("echec"),
    lues,
    reponses,
    tauxReponse: envoyees > 0 ? reponses / envoyees : null,
    conversions,
  };
}
