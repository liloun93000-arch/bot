import type Anthropic from "@anthropic-ai/sdk";
import {
  escalateToDirector,
  triggerAlert,
  type AlertDeps,
  logDecision,
  normalizeText,
  type ConversationStateData,
  type Core,
  type Logger,
  type WhatsAppClient,
} from "@arbi/core";

/**
 * ESCALADE VERS JACOB — point d'entrée UNIQUE.
 *
 * Règles (demande explicite du propriétaire) :
 *  - question inconnue → validation interne de Jacob, JAMAIS son numéro ;
 *  - UN SEUL message d'information au client par escalade (verrou d'idempotence
 *    en base : retry, webhook rejoué, double traitement ne renvoient rien) ;
 *  - la demande est toujours créée et visible au back-office (onglet Jacob,
 *    cloche, badge), même si WhatsApp n'a pas pu joindre Jacob ;
 *  - la photo éventuelle accompagne la demande.
 *
 * Le numéro de contact n'existe QUE dans le parcours de paiement (message
 * niveau 4 / garde-fou de paiement), jamais ici.
 */

/** Message client unique d'une escalade. Vouvoiement par défaut, tutoiement si le client tutoie. */
export function escalationAckText(register: ConversationStateData["toneRegister"] | undefined): string {
  return register === "relache"
    ? "Je viens de transmettre ta demande à Jacob. Il va revenir vers toi rapidement."
    : "Je viens de transmettre votre demande à Jacob. Il va revenir vers vous rapidement.";
}

/**
 * Photos du client à joindre à une demande pour Jacob : celles reçues depuis la dernière réponse du bot,
 * à défaut la plus récente des derniers messages (« Vous avez celui-ci ? » peut suivre la photo).
 */
export function recentClientPhotos(core: Core, waId: string): { media: Array<{ file: string; mime: string }>; analysis: string } {
  const rows = core.messages.history(waId, 10);
  const isImg = (r: { role: string; mediaFile: string; mediaMime: string }) =>
    r.role === "user" && !!r.mediaFile && r.mediaMime.startsWith("image/");
  const lastAssistant = [...rows].map((r) => r.role).lastIndexOf("assistant");
  let pics = rows.slice(lastAssistant + 1).filter(isImg);
  if (pics.length === 0) pics = rows.filter(isImg).slice(-1);
  const media = pics.slice(-3).map((r) => ({ file: r.mediaFile, mime: r.mediaMime }));
  const last = pics[pics.length - 1];
  const analysis = last
    ? last.contenu.replace(/^\[Photo du client — analyse automatique[^\]]*\]\s*/, "").replace(/^\[.*\]$/, "").slice(0, 400)
    : "";
  return { media, analysis };
}

export interface EscalationEnv {
  core: Core;
  wa: WhatsAppClient;
  llm: Anthropic;
  model: string;
  log: Logger;
  readMedia?: (file: string) => Promise<Buffer | null>;
  /** Dépendances complètes d'alerte (repli e-mail) ; reconstruites sinon. */
  alertDeps?: AlertDeps;
}

export interface EscalationOutcome {
  escalationId: number;
  /** La demande existait déjà (même client ou même question). */
  deduped: boolean;
  /** Jacob a reçu la demande sur WhatsApp (sinon elle reste visible au back-office). */
  notified: boolean;
  /** Le message d'information a été envoyé au client PAR CET APPEL. */
  ackSent: boolean;
}

export async function escalateAndAck(
  env: EscalationEnv,
  input: {
    waId: string;
    question: string;
    categorie?: string;
    intention?: string;
    state?: ConversationStateData;
  },
): Promise<EscalationOutcome> {
  const { core, wa, log } = env;
  const { media, analysis } = recentClientPhotos(core, input.waId);
  const contexteParts = [
    analysis ? `Photo (analyse du bot) : ${analysis}` : "",
    input.state?.serviceEnCours ? `Service en cours : ${input.state.serviceEnCours}` : "",
    input.state?.besoin ? `Besoin exprimé : ${input.state.besoin}` : "",
  ].filter(Boolean);

  // Mode prioritaire (décision de Jacob) : ALERTE → Jacob reprend lui-même la conversation.
  // Le mode « question » (Jacob répond sur WhatsApp, le bot relaie et apprend) reste disponible.
  const mode = core.settings.get("escalation_mode");
  let result: { escalationId: number; deduped: boolean; notified: boolean };
  let ackPrefix = "esc-ack";
  if (mode !== "question") {
    const alert = await triggerAlert(env.alertDeps ?? { core, wa, llm: env.llm, model: env.model, log }, {
      waId: input.waId,
      motif: [`Jacob doit reprendre la conversation : ${input.question}`, ...contexteParts].join(" — ").slice(0, 400),
      intention: input.intention ?? input.state?.lastIntent ?? "",
      categorie: input.categorie ?? "Autre",
      dernierMessage: input.question.slice(0, 300),
    });
    result = {
      escalationId: alert.alertId,
      deduped: alert.deduped,
      notified: alert.notifiedVia !== "" && alert.notifiedVia !== "aucune",
    };
    ackPrefix = "alert-ack"; // même verrou que les autres alertes : jamais deux accusés pour une alerte
  } else {
    result = await escalateToDirector(
      { core, wa, llm: env.llm, model: env.model, log, readMedia: env.readMedia },
      {
        waId: input.waId,
        question: input.question,
        categorie: input.categorie ?? "Autre",
        intention: input.intention ?? input.state?.lastIntent ?? "",
        media,
        contexte: contexteParts.join("\n"),
      },
    );
  }

  // Un seul accusé par (demande, client) — verrou posé AVANT l'envoi.
  let ackSent = false;
  const contact = core.contacts.get(input.waId);
  if (!contact?.modeHumain && !contact?.optOut) {
    const key = `${ackPrefix}:${result.escalationId}:${input.waId}`;
    if (core.sends.claim(key)) {
      const text = escalationAckText(input.state?.toneRegister);
      const sent = await wa.sendText(input.waId, text);
      if (sent.sent) {
        core.messages.insert(input.waId, "assistant", text, sent.messageId ?? null);
        ackSent = true;
      } else {
        // Échec d'envoi : on libère le verrou pour qu'une nouvelle tentative reste possible.
        core.sends.release(key);
        logDecision(log, "escalation_ack_failed", { waId: input.waId, reason: sent.reason });
      }
    } else {
      logDecision(log, "escalation_ack_skipped_duplicate", { waId: input.waId, escalationId: result.escalationId });
    }
  }
  return { escalationId: result.escalationId, deduped: result.deduped, notified: result.notified, ackSent };
}

/**
 * Réponse du bot qui avoue ne pas savoir : ce n'est PAS une résolution. Elle
 * ne doit jamais partir telle quelle (elle renverrait le client dans le vide
 * ou vers un numéro) : on la remplace par une vraie escalade.
 */
const NO_ANSWER_PATTERNS: RegExp[] = [
  /\bje n ?ai pas (?:cette |l |les |la |de )?(?:information|info|connaissance|reponse|donnee)s?\b/,
  /\bje ne dispose pas\b/,
  /\bje ne sais pas (?:te|vous) (?:repondre|dire|renseigner)\b/,
  /\bje ne suis pas en mesure de (?:te|vous) (?:repondre|renseigner|confirmer)\b/,
  /\bje n ?ai pas les connaissances\b/,
  /\bje ne peux pas (?:te|vous) (?:repondre|renseigner|confirmer)\b/,
];

export function looksLikeNoAnswer(reply: string): boolean {
  const n = normalizeText(reply).replace(/['’]/g, " ");
  return NO_ANSWER_PATTERNS.some((re) => re.test(n));
}

/** Parcours de paiement / engagement ferme : le SEUL cas où le contact de Jacob peut être donné. */
const PAYMENT_STAGE_RE =
  /\b(paiement|payer|paye|regler|reglement|virement|rib|iban|crypto|acompte|facture|encaiss|commande ferme|devis ferme|bon de commande|engagement|signer|paypal|pcs|cash|especes|lydia|western union|pas de carte|sans carte|carte bancaire|cb)/;

export function isPaymentStage(...texts: Array<string | undefined>): boolean {
  return PAYMENT_STAGE_RE.test(normalizeText(texts.filter(Boolean).join(" ")));
}

/** Chiffres significatifs d'un numéro (9 derniers) — compare « +33 7 78… » et « 07 78… ». */
export function phoneTail(n: string): string {
  return n.replace(/\D/g, "").slice(-9);
}

/**
 * Retire d'un texte client toute phrase contenant un numéro de Jacob
 * (réglage « contact direct » ou numéro admin actif). Renvoie le texte nettoyé
 * et true si quelque chose a été retiré.
 */
export function stripJacobNumbers(text: string, numbers: string[]): { text: string; stripped: boolean } {
  const tails = numbers.map(phoneTail).filter((t) => t.length === 9);
  if (tails.length === 0) return { text, stripped: false };
  const sentences = text.split(/(?<=[.!?\n])/);
  let stripped = false;
  const kept = sentences.filter((s) => {
    const digits = s.replace(/\D/g, "");
    const hit = tails.some((t) => digits.includes(t));
    if (hit) stripped = true;
    return !hit;
  });
  return { text: kept.join("").replace(/\s{2,}/g, " ").trim(), stripped };
}
