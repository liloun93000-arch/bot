import type Anthropic from "@anthropic-ai/sdk";
import {
  billingStatus,
  extractClientFacts,
  handleDirectorReply,
  isDirector,
  logDecision,
  summarizeConversation,
  normalizeText,
  triggerAlert,
  type AlertDeps,
  type Core,
  type Logger,
  type WhatsAppClient,
} from "@arbi/core";
import type { SalesAgent } from "./agent";
import { analyzeInbound, type Analysis } from "./brain";
import { sendNiveau4 } from "./tools";
import { escalateAndAck } from "./escalation";
import { PACING, replyDelayMs, splitReply } from "./pacing";
import type { InboundItem } from "./queue";

/**
 * Garde-fou de coût de l'extraction de mémoire client (§5) : au plus un
 * déclenchement toutes les 4 minutes par contact. Mémoire du process (un
 * seul processus bot en prod, le dashboard n'appelle jamais cette fonction) :
 * un redémarrage remet le throttle à zéro, impact négligeable.
 */
const FACTS_EXTRACTION_INTERVAL_MS = 4 * 60 * 1000;
const factsExtractionThrottle = new Map<string, number>();

/**
 * Tâche de fond, jamais awaited dans le chemin de réponse : extrait des faits
 * durables de la conversation et les mémorise, au plus une fois toutes les
 * 4 minutes par contact.
 */
function scheduleFactsExtraction(
  core: Core,
  llm: Anthropic,
  model: string,
  log: Logger,
  waId: string,
  analysis: Analysis,
): void {
  // Plus conditionné à `progressed` : ce drapeau ne repasse à true que
  // lorsqu'un champ d'état passe de vide à rempli, donc plus jamais après
  // deux ou trois messages. Le bot n'extrayait alors qu'UNE fois par
  // conversation, sur un transcript quasi vide — d'où l'impression qu'il ne
  // retient rien. Seul le throttle limite désormais le coût.
  const lastRun = factsExtractionThrottle.get(waId) ?? 0;
  const nowTs = Date.now();
  if (nowTs - lastRun < FACTS_EXTRACTION_INTERVAL_MS) return;
  factsExtractionThrottle.set(waId, nowTs);

  const transcript = core.messages
    .history(waId, 40)
    .map((m) => `${m.role}: ${m.contenu}`)
    .join("\n");
  const existingFacts = core.facts.actifs(waId, 20).map((f) => f.fait);
  void extractClientFacts(llm, model, transcript, existingFacts, log)
    .then((faits) => {
      for (const fait of faits) core.facts.add(waId, fait, "auto");
    })
    .catch((err) => {
      log.error({ waId, err: String(err) }, "extract_client_facts_task_failed");
    });
}

/**
 * Résumé de conversation entretenu par le BOT lui-même. Sans ça, il n'existait
 * que si Jacob ouvrait la fiche au back-office : une conversation jamais
 * consultée n'avait aucun résumé, et tout ce qui sortait de la fenêtre
 * d'historique était perdu pour le modèle.
 *
 * Déclenché au-delà de SUMMARY_MIN_MESSAGES lignes — avant, l'historique
 * suffit — et au plus une fois par tranche de SUMMARY_EVERY_MESSAGES.
 */
const SUMMARY_MIN_MESSAGES = 16;
const SUMMARY_EVERY_MESSAGES = 10;

function scheduleSummaryRefresh(
  core: Core,
  llm: Anthropic,
  model: string,
  log: Logger,
  waId: string,
): void {
  const dernier = core.messages.lastMessageId(waId);
  const state = core.state.get(waId);
  const transcript = core.messages.history(waId, 60);
  if (transcript.length < SUMMARY_MIN_MESSAGES) return;
  if (dernier - state.resumeMessageId < SUMMARY_EVERY_MESSAGES) return;

  const contact = core.contacts.get(waId);
  void summarizeConversation(llm, model, transcript, log, contact?.nom)
    .then((resume) => {
      core.state.setResume(waId, resume, dernier);
      logDecision(log, "summary_refreshed_by_bot", { waId, couvertJusqua: dernier });
    })
    .catch((err) => {
      log.error({ waId, err: String(err) }, "summary_refresh_failed");
    });
}

export const OPTOUT_CONFIRMATION =
  "C'est noté ✅ Tu ne recevras plus de messages de notre part. Écris START si tu changes d'avis.";
export const OPTIN_CONFIRMATION =
  "Avec plaisir 👋 C'est réactivé. Dis-moi ce que je peux faire pour toi.";
export const ALERT_ACK =
  "C'est noté, je fais remonter à Jacob tout de suite. Il revient vers toi rapidement.";
export const RECLAMATION_ACK =
  "Je comprends, et je préfère que Jacob gère ça directement avec toi. Il vient d'être prévenu et te répond au plus vite.";

export function isOptOut(text: string): boolean {
  const n = normalizeText(text);
  return (
    n === "stop" ||
    n === "unsubscribe" ||
    n.includes("desabonne") ||
    n.includes("desinscri") ||
    n.includes("ne plus recevoir") ||
    n.includes("plus de message")
  );
}

export function isOptIn(text: string): boolean {
  const n = normalizeText(text);
  return n === "start" || n === "reprendre" || n.includes("reabonne");
}

/** Texte posé par le pipeline média quand un vocal n'a pas pu être transcrit. */
const VOICE_FAILED_RE = /^\[Le client a envoyé un message vocal que tu ne peux pas écouter/i;

export interface HandlerDeps {
  core: Core;
  wa: WhatsAppClient;
  agent: SalesAgent;
  alertDeps: AlertDeps;
  log: Logger;
  /** Lecture d'un média archivé (transmission des photos à Jacob). */
  readMedia?: (file: string) => Promise<Buffer | null>;
  /** Coupure de service si la facturation n'est pas à jour (solde ≤ 0). */
  billingEnforced?: boolean;
  /**
   * Client LLM (déjà instrumenté par withUsageMetering) et modèle utilisés
   * pour l'extraction de mémoire client en tâche de fond (§5). Optionnels
   * pour ne rien casser côté tests existants qui ne testent pas cette
   * fonctionnalité : sans eux, l'extraction est simplement désactivée.
   */
  llm?: Anthropic;
  model?: string;
  /**
   * Rythme des réponses (script V9.1) : attente avant envoi. Absent = envoi immédiat
   * (tests) ; en production, une vraie attente (indicateur « en train d'écrire » affiché).
   */
  pace?: (ms: number) => Promise<void>;
}

/** Simple accusé de réception du client (« ok merci », « d'accord », 👍) : rien à répondre. */
const PURE_ACK_RE =
  /^(?:ok(?:ay)?|okk+|oki|d'?acc?(?:ord)?|dac|merci(?: beaucoup| bien)?|mrc|top|parfait|super|nickel|cool|ça marche|ca marche|vu|bien re[cç]u|re[cç]u|thanks?|thank you|👍|🙏|👌|✅)(?:[\s,.!]*(?:ok|merci(?: beaucoup)?|bien|à plus|a plus|bonne journée|bonne soirée|frère|frerot|khouya|👍|🙏))*[\s.!]*$/i;

/**
 * Orchestration d'un batch débouncé : opt-out → mode humain → bot actif →
 * boutons → routeur 4 niveaux → agent. Les gardes mode humain et bot actif
 * précèdent les boutons : un clic sur un ancien bouton ne doit jamais faire
 * parler le bot pendant que Jacob a la main (ni quand le bot est désactivé).
 */
export function createHandler(deps: HandlerDeps) {
  return async function handleBatch(waId: string, items: InboundItem[]): Promise<void> {
    const { core, wa, agent, log } = deps;
    const startedAt = Date.now();

    /**
     * Envoi d'une réponse du bot au rythme d'un humain (script V9.1, bloc 1) : indicateur
     * « en train d'écrire », délai proportionnel à la longueur (2 à 12 s, temps de rédaction
     * déduit), réponse longue découpée en 2-3 messages espacés de 1,5 s.
     */
    const deliver = async (text: string, coveredMessageId?: number | null): Promise<boolean> => {
      const parts = splitReply(text);
      if (deps.pace) {
        const wamid = core.messages.lastInboundWamid(waId);
        if (wamid && typeof (wa as { sendTyping?: unknown }).sendTyping === "function") {
          void wa.sendTyping(waId, wamid).catch(() => undefined);
        }
        const wait = replyDelayMs(parts[0] ?? text) - (Date.now() - startedAt);
        if (wait > 0) await deps.pace(wait);
      }
      let any = false;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i] as string;
        if (i > 0 && deps.pace) await deps.pace(PACING.gapMs);
        const sendResult = await wa.sendText(waId, part);
        logDecision(log, "reply_dispatched", { waId, sent: sendResult.sent, reason: sendResult.reason, part: i + 1, of: parts.length });
        if (!sendResult.sent) break;
        core.messages.insert(waId, "assistant", part);
        if (!any && coveredMessageId) core.state.setReplied(waId, coveredMessageId);
        any = true;
      }
      return any;
    };
    const profileName = [...items].reverse().find((i) => i.profileName)?.profileName;
    core.contacts.upsert(waId, profileName ?? null);
    const contact = core.contacts.get(waId);
    const alreadyOptedOut = Boolean(contact?.optOut);

    // ── Manager IA : réponse du directeur (Jacob) à une question escaladée ──
    // Prioritaire sur tout le reste. Si le message n'a aucun rapport (aucune
    // demande ouverte), `handled` est faux et Jacob est traité comme avant
    // (il peut donc toujours tester le bot avec son propre numéro).
    if (deps.llm && deps.model && core.settings.get("manager_ia_actif") && isDirector(core, waId)) {
      try {
        // Vocal de Jacob : le texte est la transcription (« [Message vocal] … »). On retire le
        // préfixe : le bot comprend la réponse puis rédige SA réponse au client (jamais le vocal brut).
        const jacobText = items
          .map((i) => i.text.replace(/^\[Message vocal\]\s*/i, ""))
          .join("\n")
          .trim();
        if (VOICE_FAILED_RE.test(jacobText)) {
          await wa.sendText(waId, "Je n'ai pas pu transcrire ton vocal 🙏 Peux-tu le renvoyer ou l'écrire ? (la demande reste ouverte)", { manual: true });
          return;
        }
        const reply = await handleDirectorReply(
          { core, wa, llm: deps.llm, model: deps.model, log, readMedia: deps.readMedia },
          {
            adminWaId: waId,
            text: jacobText,
            replyToWamid: items.find((i) => i.replyToWamid)?.replyToWamid,
          },
        );
        if (reply.handled) return;
      } catch (err) {
        log.error({ waId, err: String(err) }, "director_reply_failed");
      }
    }

    // ── Opt-out / opt-in (prioritaire sur tout) ──
    if (items.some((i) => isOptOut(i.text))) {
      if (!alreadyOptedOut) {
        await wa.sendText(waId, OPTOUT_CONFIRMATION);
      }
      core.contacts.setOptOut(waId, true);
      logDecision(log, "opt_out", { waId, alreadyOptedOut });
      return;
    }
    if (alreadyOptedOut) {
      if (items.some((i) => isOptIn(i.text))) {
        core.contacts.setOptOut(waId, false);
        logDecision(log, "opt_in", { waId });
        await wa.sendText(waId, OPTIN_CONFIRMATION);
        return;
      }
      logDecision(log, "ignored_opted_out", { waId });
      return;
    }

    // ── Mode humain : Jacob a repris la main, le bot se tait complètement ──
    if (contact?.modeHumain) {
      logDecision(log, "silent_human_mode", { waId });
      return;
    }

    // ── Alerte ouverte : Jacob va reprendre la conversation. Un simple « ok merci » n'appelle
    //    aucune réponse (pas de message en trop) ; une vraie question, le bot continue d'y répondre. ──
    if (core.alerts.hasOpenFor(waId) && items.every((i) => !i.buttonId && PURE_ACK_RE.test(i.text.trim()))) {
      logDecision(log, "silent_ack_after_alert", { waId });
      return;
    }

    // ── Bot désactivé globalement (réglage dashboard) ──
    if (!core.settings.get("bot_actif")) {
      logDecision(log, "bot_disabled", { waId });
      return;
    }

    // ── Facturation : service suspendu (abonnement impayé ou crédit API épuisé) ──
    if (deps.billingEnforced) {
      const billing = billingStatus(core);
      if (!billing.active) {
        logDecision(log, "billing_suspended", { waId, reason: billing.reason });
        return;
      }
    }

    const lastText = items[items.length - 1]?.text ?? "";

    // ── Boutons interactifs du niveau 4 ──
    const buttonItem = items.find((i) => i.buttonId);
    if (buttonItem?.buttonId === "btn_alerte") {
      const state = core.state.get(waId);
      const alertResult = await triggerAlert(deps.alertDeps, {
        waId,
        motif: "le client a demandé une alerte (bouton 🔔)",
        intention: state.lastIntent ?? "demande_humain",
        categorie: "Autre",
        dernierMessage: lastText.slice(0, 300),
      });
      // Accusé véridique : on ne dit « Jacob est prévenu » que si un canal a marché.
      const notified = alertResult.notifiedVia !== "" && alertResult.notifiedVia !== "aucune";
      const ack = notified
        ? ALERT_ACK
        : "C'est noté, ta demande est bien enregistrée — Jacob la verra très vite.";
      // Un seul accusé par alerte (un double clic ou un webhook rejoué n'en renvoie pas).
      const ackKey = `alert-ack:${alertResult.alertId}:${waId}`;
      if (core.sends.claim(ackKey)) {
        const ackResult = await wa.sendText(waId, ack);
        if (ackResult.sent) core.messages.insert(waId, "assistant", ack);
        else core.sends.release(ackKey);
      }
      logDecision(log, "button_alert", { waId, notified });
      return;
    }
    if (buttonItem?.buttonId === "btn_rapide") {
      const contact = core.settings.get("contact_direct");
      const message = `Parfait 👍 Écris directement à Jacob au ${contact} — réponse rapide garantie.`;
      const result = await wa.sendText(waId, message);
      if (result.sent) core.messages.insert(waId, "assistant", message);
      logDecision(log, "button_fast", { waId });
      return;
    }

    // ── Routeur explicite (niveaux 1-4) ──
    const state = core.state.get(waId);
    const analysis = analyzeInbound(core, state, items.map((i) => i.text), core.settings.get("alert_threshold"));
    core.state.save(state);
    logDecision(log, "routed", {
      waId,
      intent: analysis.intent,
      service: analysis.serviceKey,
      route: analysis.route,
    });

    const questionDraft = {
      waId,
      texte: analysis.combinedText.slice(0, 500),
      normalise: normalizeText(analysis.combinedText).slice(0, 300),
      intention: analysis.intent,
      categorie: analysis.categorie,
    };

    if (analysis.route === "alerte_directe") {
      const result = await triggerAlert(deps.alertDeps, {
        waId,
        motif: analysis.motif,
        intention: analysis.intent,
        categorie: analysis.categorie,
        dernierMessage: lastText.slice(0, 300),
      });
      // Le compteur repart à zéro : sinon chaque message suivant re-déclenche
      // la route alerte et enferme le client dans une boucle d'accusés.
      state.sansProgression = 0;
      core.state.save(state);
      // Pas de réponse figée (script V9.1, règle 2) : l'alerte est créée, Jacob est prévenu, et c'est
      // l'agent qui répond au client avec ses propres mots (il sait qu'une alerte est ouverte).
      logDecision(log, "alert_routed_to_agent", { waId, alertId: result.alertId });
      core.questions.record({ ...questionDraft, repondue: false, alerteId: result.alertId, issue: "jacob" });
      const r = await agent.respond(waId, analysis);
      if (r.text) await deliver(r.text, r.coveredMessageId);
      return;
    }

    if (analysis.route === "niveau4" && core.settings.get("escalation_mode") !== "question") {
      // Le client demande Jacob : ALERTE (Jacob reprend la conversation ici), puis l'agent répond
      // lui-même au client — sans numéro, sans message figé.
      await triggerAlert(deps.alertDeps, {
        waId,
        motif: "le client demande à parler à Jacob",
        intention: analysis.intent,
        categorie: analysis.categorie,
        dernierMessage: lastText.slice(0, 300),
      });
      state.sansProgression = 0;
      core.state.save(state);
      core.questions.record({ ...questionDraft, repondue: false, issue: "jacob" });
      const r = await agent.respond(waId, analysis);
      if (r.text) await deliver(r.text, r.coveredMessageId);
      return;
    }

    if (analysis.route === "niveau4") {
      // Le client demande un humain : validation interne de Jacob (demande visible dans son espace,
      // un seul message d'information au client, AUCUN numéro). Le contact n'est donné que dans
      // le parcours de paiement, géré par l'agent.
      const out = await escalateAndAck(
        { core, wa, llm: deps.alertDeps.llm, model: deps.alertDeps.model, log, readMedia: deps.readMedia, alertDeps: deps.alertDeps },
        { waId, question: analysis.combinedText.slice(0, 500), categorie: analysis.categorie, intention: analysis.intent, state },
      );
      if (!out.notified) {
        await triggerAlert(deps.alertDeps, {
          waId,
          motif: "demande d'un humain : Jacob n'a pas pu être joint sur WhatsApp (la demande reste visible au back-office)",
          intention: analysis.intent,
          categorie: analysis.categorie,
          dernierMessage: lastText.slice(0, 300),
        });
      }
      state.sansProgression = 0;
      core.state.save(state);
      logDecision(log, "human_request_escalated", { waId, escalationId: out.escalationId, ackSent: out.ackSent });
      core.questions.record({ ...questionDraft, repondue: false, issue: "jacob" });
      return;
    }

    // ── Niveaux 1-3 : agent ──
    const result = await agent.respond(waId, analysis);
    if (result.text) {
      await deliver(result.text, result.coveredMessageId);
    } else {
      // Escalade vers Jacob : le message d'information a déjà été envoyé (une seule fois) par
      // escalateAndAck. Le message client est marqué couvert pour ne pas être retraité.
      if (result.escalated && result.coveredMessageId) core.state.setReplied(waId, result.coveredMessageId);
      logDecision(log, "no_reply", { waId, niveau4: result.niveau4Sent, alerte: result.alertFired, escalated: result.escalated });
    }
    // Une réponse jamais envoyée n'est pas une question traitée : sans ça, le
    // back-office comptait comme répondues des questions restées en plan.
    const repondue = result.text !== null && !result.alertFired && !result.niveau4Sent && !result.escalated;
    // Une question restée sans réponse ne doit JAMAIS rester invisible : alerte ouverte → le client est
    // « en alerte » et la conversation reste dans celles que Jacob doit traiter.
    if (!repondue && !core.alerts.hasOpenFor(waId) && !core.knowledge.escalations.openFor(waId)) {
      await triggerAlert(deps.alertDeps, {
        waId,
        motif: "question restée sans réponse du bot",
        intention: analysis.intent,
        categorie: analysis.categorie,
        dernierMessage: lastText.slice(0, 300),
      });
      logDecision(log, "unanswered_question_alert", { waId });
    }
    core.questions.record({
      ...questionDraft,
      repondue,
      // Par QUESTION : réponse envoyée sans aucune intervention = autonome ; escalade, alerte ou
      // niveau 4 = intervention de Jacob, même si Jacob répond ensuite.
      ...(result.escalated || result.alertFired || result.niveau4Sent
        ? { issue: "jacob" as const }
        : result.text !== null
          ? { issue: "autonome" as const }
          : {}),
    });

    // ── Mémoire client (§5) : tâche de fond, après l'envoi de la réponse ──
    if (deps.llm && deps.model) {
      scheduleFactsExtraction(core, deps.llm, deps.model, log, waId, analysis);
      scheduleSummaryRefresh(core, deps.llm, deps.model, log, waId);
    }
  };
}
