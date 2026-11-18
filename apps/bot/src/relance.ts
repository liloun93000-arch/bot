import type Anthropic from "@anthropic-ai/sdk";
import {
  REASONING_HEADROOM,
  dueRelances,
  planRelances,
  recordRelanceFailure,
  recordRelanceSent,
  relanceConfig,
  type Core,
  type DueRelance,
  type Logger,
  type WhatsAppClient,
} from "@arbi/core";

export interface RelanceDeps {
  core: Core;
  wa: Pick<WhatsAppClient, "sendText" | "sendTemplate">;
  llm: Anthropic;
  model: string;
  log: Logger;
}

const MAX_LEN = 320;

/** Texte de secours sans IA : court, personnel, sans prix ni promesse. */
export function fallbackRelanceText(nom: string | null, service: string | null): string {
  const prenom = (nom ?? "").trim().split(/\s+/)[0] ?? "";
  const salut = prenom && !/^\d/.test(prenom) ? `Salut ${prenom}` : "Salut";
  return service
    ? `${salut} 👋 je reviens vers toi pour ton projet (${service}). Tu as pu y réfléchir ? Dis-moi si tu as une question, je reste dispo.`
    : `${salut} 👋 je reviens vers toi suite à notre échange. Tu as pu y réfléchir ? Dis-moi si tu as une question, je reste dispo.`;
}

/** Une relance IA n'est acceptée que si elle est courte et ne contient ni prix, ni lien, ni promesse. */
export function isAcceptableRelance(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > MAX_LEN) return false;
  if (/https?:\/\/|www\./i.test(t)) return false;
  if (/€|\beuros?\b|\$|\d{3,}/i.test(t)) return false;
  if (/garanti|promis|obligatoire|dernier(e)? chance|urgent|offre limit/i.test(t)) return false;
  return true;
}

async function generateText(deps: RelanceDeps, waId: string): Promise<{ text: string; ia: boolean }> {
  const { core, llm, model, log } = deps;
  const contact = core.contacts.get(waId);
  const state = core.state.get(waId);
  const service = state.serviceEnCours ?? null;
  const fallback = fallbackRelanceText(contact?.nom ?? null, service);
  if (!relanceConfig(core).personnaliser) return { text: fallback, ia: false };

  const lines = core.messages
    .history(waId, 8)
    .map((m) => `${m.role === "user" ? "Client" : "Nous"} : ${String(m.contenu).slice(0, 300)}`)
    .join("\n");
  try {
    const response = await llm.messages.create({
      model,
      max_tokens: REASONING_HEADROOM + 150,
      system:
        "Tu écris UN seul message WhatsApp de relance, en français, pour un client qui n'a pas répondu. " +
        "Ton chaleureux, naturel, tutoiement, 1 à 2 phrases (300 caractères max), au maximum un emoji. " +
        "Fais référence à son sujet réel d'après la conversation. Pose une question simple et ouverte. " +
        "INTERDIT : prix, chiffres, liens, promesses, pression, fausse urgence, remise. " +
        "Réponds UNIQUEMENT avec le message, sans guillemets ni préambule.",
      messages: [{ role: "user", content: `Client : ${contact?.nom || "inconnu"}\nSujet : ${service ?? "non précisé"}\n\nDernier échange :\n${lines}` }],
    });
    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .replace(/^["«\s]+|["»\s]+$/g, "")
      .trim();
    if (isAcceptableRelance(text)) return { text, ia: true };
    log.warn({ waId }, "relance_text_rejected");
  } catch (err) {
    log.error({ waId, err: String(err) }, "relance_generate_failed");
  }
  return { text: fallback, ia: false };
}

const flat = (t: string): string => t.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 500);

async function sendOne(deps: RelanceDeps, due: DueRelance, now: number): Promise<"sent" | "failed"> {
  const { core, wa, log } = deps;
  const { text, ia } = await generateText(deps, due.waId);
  const cfg = relanceConfig(core);
  let canal = due.canal;
  let res = canal === "libre" ? await wa.sendText(due.waId, text) : { sent: false as boolean, reason: "template" as string | undefined, messageId: undefined as string | undefined };

  // Fenêtre refusée par Meta alors que nous la croyions ouverte : seul le template est possible.
  if (canal === "libre" && !res.sent && res.reason === "outside_24h_window") {
    if (cfg.templateHorsFenetre && cfg.templateName) canal = "template";
  }
  if (canal === "template") {
    const lang = core.contacts.get(due.waId)?.langue || "fr";
    res = await wa.sendTemplate(due.waId, cfg.templateName, lang, [{ type: "body", parameters: [{ type: "text", text: flat(text) }] }]);
    if (!res.sent) res = await wa.sendTemplate(due.waId, cfg.templateName, lang);
  }
  if (!res.sent) {
    recordRelanceFailure(core, due.id, res.reason ?? "inconnu", now);
    log.warn({ waId: due.waId, reason: res.reason }, "relance_auto_failed");
    return "failed";
  }
  recordRelanceSent(core, due.id, { texte: text, canal, wamid: res.messageId ?? null, stored: canal === "template" ? `[Relance automatique par template] ${text}` : text }, now);
  log.info({ waId: due.waId, canal, ia }, "relance_auto_sent");
  return "sent";
}

let running = false;

/** Un passage : planifie, puis envoie les relances arrivées à échéance. Ne lève jamais. */
export async function relanceTick(deps: RelanceDeps, now: number = Date.now()): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  if (running) return out;
  running = true;
  try {
    if (!relanceConfig(deps.core).actif) return out;
    planRelances(deps.core, now);
    for (const due of dueRelances(deps.core, now)) {
      const r = await sendOne(deps, due, now);
      out[r === "sent" ? "sent" : "failed"]++;
    }
  } catch (err) {
    deps.log.error({ err: String(err) }, "relance_tick_failed");
  } finally {
    running = false;
  }
  return out;
}
