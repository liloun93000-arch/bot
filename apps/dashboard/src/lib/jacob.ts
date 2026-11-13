import type { Core } from "@arbi/core";

/**
 * Demandes pour lesquelles le bot a besoin de Jacob : questions inconnues
 * (escalades du Manager IA) ET alertes (réclamation, paiement, client bloqué).
 * Une seule définition pour la page « Jacob », le badge de la barre du bas, la
 * cloche et l'accueil : ils affichent donc toujours le même nombre.
 */

export interface JacobItem {
  key: string;
  kind: "question" | "alerte";
  id: number;
  waId: string;
  nom: string;
  /** La question du client (ou le motif de l'alerte). */
  question: string;
  /** Extrait du contexte utile à Jacob. */
  contexte: string;
  quand: number;
  resolu: boolean;
  statutLabel: string;
  mediaFile: string;
  mediaMime: string;
  reponse: string;
  resolvedAt: number | null;
  /** Alerte de réservation d'appel : à approuver ou refuser (page Rendez-vous). */
  rdv?: boolean;
}

export function jacobPendingCount(core: Core): number {
  return core.knowledge.escalations.countOpen() + core.alerts.countOpen();
}

function labelOf(core: Core, waId: string): string {
  const nom = (core.contacts.get(waId)?.nom ?? "").trim();
  if (nom) return nom;
  return waId.length > 6 ? `+${waId.slice(0, 2)} … ${waId.slice(-3)}` : `+${waId}`;
}

/** Dernière photo envoyée par ce client (pour les alertes, qui n'ont pas de média propre). */
function lastClientPhoto(core: Core, waId: string): { file: string; mime: string } {
  const row = core.sqlite
    .prepare(
      `SELECT media_file AS file, media_mime AS mime FROM messages
       WHERE wa_id = ? AND role = 'user' AND media_mime LIKE 'image/%' AND media_file <> ''
       ORDER BY id DESC LIMIT 1`,
    )
    .get(waId) as { file: string; mime: string } | undefined;
  return row ?? { file: "", mime: "" };
}

function lastClientText(core: Core, waId: string): string {
  const row = core.sqlite
    .prepare(`SELECT contenu FROM messages WHERE wa_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1`)
    .get(waId) as { contenu: string } | undefined;
  return (row?.contenu ?? "").replace(/^\[[^\]]*\]\s*/, "").slice(0, 240);
}

type EscalationLike = ReturnType<Core["knowledge"]["escalations"]["open"]>[number];
type AlertLike = ReturnType<Core["alerts"]["open"]>[number];

function fromEscalation(core: Core, e: EscalationLike): JacobItem {
  const resolu = e.statut !== "en_attente";
  return {
    key: `q${e.id}`,
    kind: "question",
    id: e.id,
    waId: e.waId,
    nom: labelOf(core, e.waId),
    question: e.question,
    contexte: e.contexte,
    quand: e.createdAt,
    resolu,
    statutLabel: !resolu ? "En attente de Jacob" : e.statut === "erreur" ? "Réponse non envoyée" : e.statut === "annulee" ? "Annulée" : "Résolu par Jacob",
    mediaFile: e.mediaFile,
    mediaMime: e.mediaMime,
    reponse: e.reponseJacob,
    resolvedAt: e.resolvedAt,
  };
}

function fromAlert(core: Core, a: AlertLike): JacobItem {
  const resolu = a.statut !== "ouverte";
  const photo = lastClientPhoto(core, a.waId);
  return {
    key: `a${a.id}`,
    kind: "alerte",
    id: a.id,
    waId: a.waId,
    nom: labelOf(core, a.waId),
    question: a.dernierMessage || lastClientText(core, a.waId) || a.motif,
    contexte: [a.motif, a.resume].filter(Boolean).join(" — ").slice(0, 400),
    quand: a.createdAt,
    resolu,
    statutLabel: resolu ? "Résolu par Jacob" : "En attente de Jacob",
    mediaFile: photo.file,
    mediaMime: photo.mime,
    reponse: "",
    resolvedAt: a.treatedAt ?? null,
    rdv: a.categorie === "Réservation d'appel",
  };
}

/** Demandes en attente, les plus anciennes d'abord (ce sont les plus urgentes). */
export function jacobPending(core: Core): JacobItem[] {
  const items = [
    ...core.knowledge.escalations.open().map((e) => fromEscalation(core, e)),
    ...core.alerts.open().map((a) => fromAlert(core, a)),
  ];
  return items.sort((a, b) => a.quand - b.quand);
}

/** Historique : demandes résolues, les plus récentes d'abord. */
export function jacobHistory(core: Core, limit = 30): JacobItem[] {
  const alerts = core.alerts.closed(limit).map((r) => fromAlert(core, r as AlertLike));
  const questions = core.knowledge.escalations.closed(limit).map((e) => fromEscalation(core, e));
  return [...alerts, ...questions]
    .sort((a, b) => (b.resolvedAt ?? b.quand) - (a.resolvedAt ?? a.quand))
    .slice(0, limit);
}

/** « il y a 12 min », « il y a 3 h », « 2 j ». */
export function waitingLabel(ts: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - ts) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} j`;
}
