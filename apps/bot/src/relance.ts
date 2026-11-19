import type Anthropic from "@anthropic-ai/sdk";
import {
  REASONING_HEADROOM,
  dueRelances,
  planRelances,
  closeRelance,
  recordRelanceFailure,
  relanceContext,
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

const MAX_LEN = 360;

/** Mot-clé de sortie du modèle quand aucune relance utile n'est possible. */
const NO_RELANCE = "AUCUNE";

const norm = (t: string): string => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Recouvrement de mots entre deux textes (0–1) : repère une relance qui répète un message déjà envoyé. */
function overlap(a: string, b: string): number {
  const wa = new Set(norm(a).split(" ").filter((w) => w.length > 3));
  const wb = new Set(norm(b).split(" ").filter((w) => w.length > 3));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size);
}

/**
 * Une relance IA n'est acceptée que si elle est courte, sans prix ni lien ni promesse, pose une vraie
 * question, et ne répète ni notre dernier message ni une relance précédente. Aucun texte de secours.
 */
export function isAcceptableRelance(text: string, ctx?: { dernierNous?: string; precedentes?: string[] }): boolean {
  const t = text.trim();
  if (!t || t.length > MAX_LEN || t.toUpperCase().startsWith(NO_RELANCE)) return false;
  if (!t.includes("?")) return false;
  if (/https?:\/\/|www\./i.test(t)) return false;
  if (/€|\beuros?\b|\$|\d{3,}/i.test(t)) return false;
  if (/garanti|promis|obligatoire|dernier(e)? chance|urgent|offre limit|derni[eè]re occasion|ne rate pas|plus que quelques/i.test(t)) return false;
  if (ctx?.dernierNous && overlap(t, ctx.dernierNous) > 0.8) return false;
  if (ctx?.precedentes?.some((p) => overlap(t, p) > 0.7)) return false;
  return true;
}

const SYSTEM =
  "Tu rédiges UN message WhatsApp de relance pour CELLUL'ART, à envoyer à un client qui n'a pas répondu à notre dernier message. " +
  "Tu disposes de la vraie conversation : ton message doit être ancré dedans (son sujet précis, ce qu'il a demandé, ce qu'on lui a déjà dit, la dernière question posée) " +
  "et ne doit rien redire de ce qui a déjà été donné. Le silence n'est ni un refus ni une vente perdue : ne le suggère jamais. " +
  "But : savoir avec légèreté s'il est toujours intéressé, s'il y réfléchit encore, s'il lui manque une information, s'il veut continuer ou non — " +
  "en rebondissant sur le dernier point resté ouvert (par exemple notre question de qualification restée sans réponse). " +
  "Ton chaleureux, naturel, commercial sans pression, tutoiement, 1 à 3 phrases courtes, un emoji au maximum, et une seule question. " +
  "INTERDIT : prix ou chiffres, liens, remise, promesse, fausse urgence, culpabilisation, formule toute faite générique du type « je reviens vers toi suite à notre échange ». " +
  `Si la conversation ne permet pas une relance utile et précise, réponds uniquement ${NO_RELANCE}. ` +
  "Réponds UNIQUEMENT avec le message (ou " + NO_RELANCE + "), sans guillemets ni préambule.";

interface Generated {
  text: string | null;
  motif: string;
}

/** Texte personnalisé d'après la conversation réelle. Aucun texte de secours : sans texte conforme, on n'envoie rien. */
async function generateText(deps: RelanceDeps, waId: string): Promise<Generated> {
  const { core, llm, model, log } = deps;
  const ctx = relanceContext(core, waId);
  if (!ctx.pertinent) return { text: null, motif: "Aucun intérêt ni question en attente : relance inutile" };
  const contact = core.contacts.get(waId);
  const prenom = (contact?.nom ?? "").trim().split(/\s+/)[0] ?? "";
  const lines = ctx.derniersEchanges.map((m) => `${m.role === "user" ? "Client" : m.role === "human" ? "Jacob" : "Bot"} : ${m.texte}`).join("\n");
  const user = [
    `Prénom : ${prenom && !/^\d/.test(prenom) ? prenom : "(inconnu)"}`,
    `Sujet en cours : ${ctx.service ?? "non identifié"}`,
    `Avancement commercial : ${ctx.statutLead ?? "aucune fiche"}`,
    `Type de situation : ${ctx.type === "question" ? "notre question de qualification est restée sans réponse" : "le client a montré un intérêt"}`,
    ctx.questionEnAttente ? `Dernière question que nous avons posée : ${ctx.questionEnAttente}` : "",
    ctx.faits.length ? `Ce que l'on sait du client : ${ctx.faits.join(" ; ")}` : "",
    ctx.relancesPrecedentes.length ? `Relances déjà envoyées (à ne pas répéter) : ${ctx.relancesPrecedentes.join(" | ")}` : "",
    "",
    "Conversation (du plus ancien au plus récent) :",
    lines,
  ].filter((l) => l !== "").join("\n");
  try {
    const response = await llm.messages.create({
      model,
      max_tokens: REASONING_HEADROOM + 200,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .replace(/^["«\s]+|["»\s]+$/g, "")
      .trim();
    if (text.toUpperCase().startsWith(NO_RELANCE)) return { text: null, motif: "L'IA a jugé qu'aucune relance utile n'était possible" };
    if (isAcceptableRelance(text, { dernierNous: ctx.dernierNous, precedentes: ctx.relancesPrecedentes })) return { text, motif: "" };
    log.warn({ waId }, "relance_text_rejected");
    return { text: null, motif: "Texte généré non conforme (prix, lien, répétition ou sans question) : rien n'est envoyé" };
  } catch (err) {
    log.error({ waId, err: String(err) }, "relance_generate_failed");
    return { text: null, motif: "Génération du texte impossible : rien n'est envoyé" };
  }
}

const flat = (t: string): string => t.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 500);

async function sendOne(deps: RelanceDeps, due: DueRelance, now: number): Promise<"sent" | "failed" | "skipped"> {
  const { core, wa, log } = deps;
  const gen = await generateText(deps, due.waId);
  if (!gen.text) {
    closeRelance(core, due.id, "ignoree", gen.motif, now);
    log.info({ waId: due.waId, motif: gen.motif }, "relance_auto_skipped");
    return "skipped";
  }
  const text = gen.text;
  const cfg = relanceConfig(core);
  let canal = due.canal;
  let res = canal === "libre" ? await wa.sendText(due.waId, text) : { sent: false as boolean, reason: "template" as string | undefined, messageId: undefined as string | undefined };

  // Fenêtre refusée par Meta alors que nous la croyions ouverte : seul le template est possible.
  if (canal === "libre" && !res.sent && res.reason === "outside_24h_window") {
    if (cfg.templateHorsFenetre && cfg.templateName) canal = "template";
  }
  if (canal === "template") {
    const lang = core.contacts.get(due.waId)?.langue || "fr";
    // Une seule variable autorisée : le texte personnalisé. Jamais de repli sur un template non personnalisé.
    res = await wa.sendTemplate(due.waId, cfg.templateName, lang, [{ type: "body", parameters: [{ type: "text", text: flat(text) }] }]);
  }
  if (!res.sent) {
    recordRelanceFailure(core, due.id, res.reason ?? "inconnu", now);
    log.warn({ waId: due.waId, reason: res.reason }, "relance_auto_failed");
    return "failed";
  }
  recordRelanceSent(core, due.id, { texte: text, canal, wamid: res.messageId ?? null, stored: canal === "template" ? `[Relance automatique par template] ${text}` : text }, now);
  log.info({ waId: due.waId, canal }, "relance_auto_sent");
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
      if (r !== "skipped") out[r]++;
    }
  } catch (err) {
    deps.log.error({ err: String(err) }, "relance_tick_failed");
  } finally {
    running = false;
  }
  return out;
}
