import { isRealQuestion } from "./categories";
import type { Core } from "./db";
import { isSubjectlessRequest } from "./qualification";

/**
 * Audit des alertes Jacob ouvertes : repère celles qui ne demandent AUCUNE
 * intervention humaine (le bot indique lui-même « Blocage : aucun », client
 * resté vague, question déjà traitée depuis). Règles volontairement prudentes :
 * dans le doute, l'alerte reste ouverte.
 */
export interface AlertAuditItem {
  id: number;
  waId: string;
  motif: string;
  dernierMessage: string;
  createdAt: number;
  /** « fausse_alerte » : retirer ; « deja_traitee » : la demande a eu sa réponse depuis ; « a_garder » : intervention utile. */
  verdict: "fausse_alerte" | "deja_traitee" | "a_garder";
  raison: string;
}

/** Motifs qui correspondent à un vrai besoin humain : jamais retirés automatiquement. */
export const PROTECTED_MOTIF_RE =
  /r[eé]clam|probl[eè]me|remboursement|litige|paiement|payer|virement|facture|parler [àa] jacob|demande (?:d'|à )?(?:un )?humain|n'a pas pu [êe]tre joint|rendez-vous|rdv|r[eé]servation|colis|commande|livraison|accord|d[eé]cision/i;

export const STALL_MOTIF_RE = /[ée]changes? sans progression/i;
const UNANSWERED_MOTIF_RE = /question rest[ée]e sans r[ée]ponse/i;
export const NO_BLOCKAGE_RE = /Blocage\s*:\s*(?:aucun|n[ée]ant|rien|pas de blocage|—|-)(?:\b|\s|\.|$)/i;

interface Msg {
  id: number;
  role: string;
  contenu: string;
  ts: number;
}

/** Le dernier message du client attend-il encore une vraie réponse (ni bot ni Jacob n'ont écrit après) ? */
function hasUnansweredRealQuestion(messages: Msg[]): boolean {
  let lastUser: Msg | undefined;
  for (const m of messages) if (m.role === "user") lastUser = m;
  if (!lastUser) return false;
  const answered = messages.some((m) => m.id > lastUser.id && (m.role === "assistant" || m.role === "human"));
  if (answered) return false;
  return isRealQuestion(lastUser.contenu) && !isSubjectlessRequest(lastUser.contenu);
}

export function auditOpenAlerts(core: Core): AlertAuditItem[] {
  const out: AlertAuditItem[] = [];
  for (const alert of core.alerts.open()) {
    const base = {
      id: alert.id,
      waId: alert.waId,
      motif: alert.motif,
      dernierMessage: alert.dernierMessage,
      createdAt: alert.createdAt,
    };
    // Une demande Manager IA ouverte pour ce client = vraie attente de Jacob.
    if (core.knowledge.escalations.openFor(alert.waId)) {
      out.push({ ...base, verdict: "a_garder", raison: "Une question est ouverte chez Jacob (Manager IA)." });
      continue;
    }
    if (PROTECTED_MOTIF_RE.test(alert.motif) || alert.categorie === "Réservation d'appel") {
      out.push({ ...base, verdict: "a_garder", raison: "Motif qui demande une intervention humaine." });
      continue;
    }
    const messages = core.messages.fullTranscript(alert.waId) as Msg[];
    if (hasUnansweredRealQuestion(messages)) {
      out.push({ ...base, verdict: "a_garder", raison: "Le client attend encore une réponse à une vraie question." });
      continue;
    }
    const answeredSince = messages.some(
      (m) => m.ts >= alert.createdAt && (m.role === "assistant" || m.role === "human"),
    );
    if (UNANSWERED_MOTIF_RE.test(alert.motif) && answeredSince) {
      out.push({ ...base, verdict: "deja_traitee", raison: "La question a reçu une réponse depuis l'alerte." });
      continue;
    }
    if (STALL_MOTIF_RE.test(alert.motif)) {
      out.push({
        ...base,
        verdict: "fausse_alerte",
        raison: "Alerte pour « échanges sans progression » : un client resté vague n'est pas un blocage.",
      });
      continue;
    }
    if (NO_BLOCKAGE_RE.test(alert.resume)) {
      out.push({ ...base, verdict: "fausse_alerte", raison: "Le résumé du bot indique lui-même « Blocage : aucun »." });
      continue;
    }
    out.push({ ...base, verdict: "a_garder", raison: "Rien ne prouve que l'alerte soit injustifiée." });
  }
  return out;
}

/**
 * Retire les alertes injustifiées désignées. L'historique est conservé (statut
 * « retiree » + motif). Aucun message n'est envoyé aux clients.
 */
export function clearAuditedAlerts(core: Core, ids?: number[]): { cleared: number } {
  const items = auditOpenAlerts(core).filter(
    (i) => i.verdict !== "a_garder" && (!ids || ids.includes(i.id)),
  );
  let cleared = 0;
  for (const item of items) {
    const done = core.alerts.retire(item.id, item.raison);
    if (!done) continue;
    cleared++;
    // Le client n'est plus « en alerte » si aucune autre alerte n'est ouverte pour lui.
    if (!core.alerts.hasOpenFor(item.waId) && core.contacts.get(item.waId)?.statut === "alerte") {
      core.contacts.setStatut(item.waId, "en_cours");
    }
  }
  return { cleared };
}
