import type Anthropic from "@anthropic-ai/sdk";
import { flattenTemplateParam } from "./alerts";
import type { AdminNumber, Core } from "./db";
import {
  bestMatches,
  confidenceLevel,
  formatEscalationMessage,
  formatPhotoEscalationCaption,
  judgeConflictFallback,
  knowledgeRejectReason,
  parseStructuredJson,
  structureFallback,
  type ConflictVerdict,
  type ConfidenceThresholds,
  type EscalationRow,
  type KnowledgeEntry,
  type LinkDelivery,
  type StructuredKnowledge,
} from "./knowledge";
import { REASONING_HEADROOM } from "./llm";
import type { Logger } from "./logger";
import { logDecision } from "./logger";
import type { WhatsAppClient } from "./whatsapp";

/**
 * MANAGER IA → DIRECTEUR.
 *
 * Hiérarchie : CLIENT → MANAGER IA (le bot) → JACOB (directeur), seulement si
 * nécessaire. Ce module porte les deux demi-flux :
 *  1. `escalateToDirector` : le bot ne sait pas → question courte à Jacob sur
 *     WhatsApp (dédoublonnée), enregistrée dans `escalations`.
 *  2. `handleDirectorReply` : Jacob répond (réponse WhatsApp native, repérée par
 *     le contexte de réponse) → le bot structure la connaissance, gère les
 *     contradictions (Jacob prime, historique conservé), répond à TOUTES les
 *     conversations concernées et mémorise pour les prochains clients.
 *
 * Tout est additif : si `manager_ia_actif` est faux, ce module n'est jamais
 * appelé et le bot se comporte exactement comme avant.
 */

export interface DirectorDeps {
  core: Core;
  wa: WhatsAppClient;
  llm: Anthropic;
  model: string;
  log: Logger;
  /** Lecture d'un média archivé (accès disque injecté) : nécessaire pour transmettre une photo à Jacob. */
  readMedia?: (file: string) => Promise<Buffer | null>;
}

export function thresholdsFrom(core: Core): ConfidenceThresholds {
  const haut = Number(core.settings.get("confiance_seuil_haut"));
  const bas = Number(core.settings.get("confiance_seuil_bas"));
  const h = Number.isFinite(haut) ? Math.min(0.95, Math.max(0.3, haut)) : 0.7;
  const b = Number.isFinite(bas) ? Math.min(h - 0.05, Math.max(0.1, bas)) : 0.4;
  return { haut: h, bas: b };
}

const digits = (n: string) => n.replace(/[^\d]/g, "");

export function activeAdminIds(core: Core): string[] {
  const admins = core.settings.get("admin_numbers") as AdminNumber[];
  return admins.filter((a) => a.actif && a.number).map((a) => digits(a.number));
}

export function isDirector(core: Core, waId: string): boolean {
  return activeAdminIds(core).includes(digits(waId));
}

async function askLlm(
  deps: DirectorDeps,
  system: string,
  user: string,
  answerTokens: number,
  tag: string,
): Promise<string | null> {
  try {
    const response = await deps.llm.messages.create({
      model: deps.model,
      // Modèle à raisonnement : le plafond DOIT inclure la marge de réflexion.
      max_tokens: REASONING_HEADROOM + answerTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || null;
  } catch (err) {
    deps.log.error({ err: String(err), tag }, "director_llm_failed");
    return null;
  }
}

// ─── 1. Escalade vers Jacob ─────────────────────────────────────────────────

export interface EscalateInput {
  waId: string;
  question: string;
  categorie?: string;
  intention?: string;
  /** Photo(s) du client liées à la question : elles suivent la demande jusqu'à Jacob. */
  media?: Array<{ file: string; mime: string }>;
  /** Contexte utile à Jacob (analyse de la photo, service en cours…). */
  contexte?: string;
}

export interface EscalateResult {
  escalationId: number;
  deduped: boolean;
  /** true si Jacob a effectivement reçu (ou déjà reçu) la question. */
  notified: boolean;
  notifiedVia: string;
  /** true si la photo a été transmise à Jacob dans WhatsApp. */
  photoSent?: boolean;
}

export async function escalateToDirector(deps: DirectorDeps, input: EscalateInput): Promise<EscalateResult> {
  const { core, wa, log } = deps;
  const kb = core.knowledge.escalations;
  const question = input.question.replace(/\s+/g, " ").trim();
  const photos = (input.media ?? []).filter((m) => m.file && m.mime.startsWith("image/"));
  const hasPhoto = photos.length > 0;

  // Déduplication : JAMAIS pour une question accompagnée d'une photo (« Vous avez celui-ci ? »
  // de deux clients = deux articles différents). Sans photo : même client ou question quasi identique.
  if (!hasPhoto) {
    const existing = kb.findOpenSimilar(question) ?? kb.openFor(input.waId);
    if (existing && !existing.mediaFile) {
      kb.link(existing.id, input.waId, question);
      logDecision(log, "escalation_deduped", { waId: input.waId, escalationId: existing.id });
      return {
        escalationId: existing.id,
        deduped: true,
        notified: existing.notifiedVia !== "" && existing.notifiedVia !== "aucune",
        notifiedVia: existing.notifiedVia,
      };
    }
  }

  const id = kb.create({
    waId: input.waId,
    question,
    categorie: input.categorie || "Autre",
    intention: input.intention ?? "",
    mediaFile: photos[0]?.file ?? "",
    mediaMime: photos[0]?.mime ?? "",
    contexte: input.contexte ?? "",
  });
  const contact = core.contacts.get(input.waId);
  const clientLabel = contact?.nom ? `${contact.nom} (+${input.waId})` : `+${input.waId}`;
  const categorie = input.categorie || "Autre";
  const text = formatEscalationMessage({ clientLabel, categorie, question, contexte: input.contexte });
  const caption = formatPhotoEscalationCaption({ clientLabel, categorie, question, contexte: input.contexte });

  const channels: string[] = [];
  let photoSent = false;
  for (const adminWaId of activeAdminIds(core)) {
    let result: { sent: boolean; reason?: string; messageId?: string } = { sent: false };
    let via = "texte";

    // 0) Photo + question dans UN seul message WhatsApp : répondre à ce message = répondre à CETTE demande.
    if (hasPhoto && deps.readMedia) {
      const first = photos[0] as { file: string; mime: string };
      const buffer = await deps.readMedia(first.file);
      const mediaId = buffer ? await wa.uploadMedia(buffer, first.mime, first.file) : null;
      if (mediaId) {
        result = await wa.sendMedia(adminWaId, "image", mediaId, { caption });
        via = "photo";
        if (result.sent && result.messageId) kb.addMessage(id, adminWaId, result.messageId);
        // Photos supplémentaires : envoyées à la suite, également reliées à la demande.
        if (result.sent) {
          for (const extra of photos.slice(1, 4)) {
            const buf = await deps.readMedia(extra.file);
            const mid = buf ? await wa.uploadMedia(buf, extra.mime, extra.file) : null;
            if (!mid) continue;
            const r = await wa.sendMedia(adminWaId, "image", mid, {});
            if (r.sent && r.messageId) kb.addMessage(id, adminWaId, r.messageId);
          }
          photoSent = true;
        }
      }
    }

    // 1) Texte libre (si la photo n'a pas pu partir, on le dit : elle reste visible au dashboard).
    if (!result.sent) {
      const note = hasPhoto ? `\n\n📷 Le client a joint une photo (je n'ai pas pu te l'envoyer ici : elle est visible dans la conversation du dashboard).` : "";
      result = await wa.sendText(adminWaId, text + note);
      via = "texte";
    }
    // 2) Hors fenêtre : template approuvé `alerte_admin` (6 paramètres + bouton vers la conversation).
    if (!result.sent) {
      const t = flattenTemplateParam;
      result = await wa.sendTemplate(adminWaId, core.settings.get("alert_template_name"), core.settings.get("alert_template_lang"), [
        {
          type: "body",
          parameters: [
            { type: "text", text: t(clientLabel, 80) },
            { type: "text", text: t(categorie, 40) },
            { type: "text", text: hasPhoto ? "Question client + photo" : "Question client" },
            { type: "text", text: t(`“${question}”${hasPhoto ? " — 📷 photo visible via le bouton (conversation du dashboard)" : ""} — Réponds simplement à ce message.`, 450) },
            { type: "text", text: "Demande du Manager IA" },
            { type: "text", text: t(question, 150) },
          ],
        },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: input.waId }] },
      ]);
      via = "template";
    }
    if (result.sent) {
      channels.push(`${via}:${adminWaId}`);
      // Le wamid relie la réponse native de Jacob (contexte de réponse) à CETTE demande.
      if (via !== "photo" && result.messageId) kb.addMessage(id, adminWaId, result.messageId);
    } else {
      logDecision(log, "escalation_notify_failed", { escalationId: id, admin: adminWaId, reason: result.reason });
    }
  }
  const via = channels.length > 0 ? channels.join(",") : "aucune";
  kb.setNotifiedVia(id, via);
  logDecision(log, "escalation_created", { waId: input.waId, escalationId: id, via, photo: hasPhoto, photoSent });
  return { escalationId: id, deduped: false, notified: channels.length > 0, notifiedVia: via, photoSent };
}

// ─── 2. Réponse de Jacob ────────────────────────────────────────────────────

const CORRECTION_RE = /^\s*(correction|corrige|rectification|rectif|mise à jour|mise a jour|maj|attention)\s*[:\-–—]\s*/i;

const STRUCTURE_SYSTEM = `Tu transformes la réponse du directeur (Jacob) en CONNAISSANCE MÉTIER structurée, réutilisable pour d'autres clients. Réponds UNIQUEMENT par un objet JSON :
{"sujet":"","theme":"","categorie":"Digital|China|Formation|Société|Autre","offre_cle":"","intention":"","reponse":"","conditions":"","exceptions":"","nature":"nouvelle|correction|precision","memoriser":true}
Règles :
- intention : la question canonique, impersonnelle (« Le paiement en plusieurs fois est-il possible ? »), sans nom de client.
- reponse : ce qui est vrai pour l'entreprise, reformulé clairement, sans copier mot pour mot.
- conditions : TOUTES les conditions de Jacob, INTACTES (ex. « uniquement à partir de 500 € »). Ne jamais les simplifier ni les arrondir. Vide si aucune.
- exceptions : cas particuliers cités par Jacob. Vide si aucune.
- Aucune donnée personnelle (nom, téléphone, e-mail), aucun lien ou coordonnée de paiement.
- nature : « correction » si Jacob corrige une information précédente, « precision » s'il complète, sinon « nouvelle ».
- memoriser : false si la réponse ne vaut que pour CE cas précis (ex. « oui celui-là » à propos d'une photo dont l'article n'est pas nommé, ou réponse sans portée générale). Pour une question avec photo : formule la connaissance sur l'ARTICLE identifié grâce à la description de la photo (modèle, type, matière…) ; si l'article n'est pas identifiable, memoriser=false.`;

async function structure(
  deps: DirectorDeps,
  question: string,
  reponseJacob: string,
  categorie: string,
  correction: boolean,
  contexte = "",
  hasPhoto = false,
): Promise<StructuredKnowledge> {
  const raw = await askLlm(
    deps,
    STRUCTURE_SYSTEM,
    `Question du client : ${question}${contexte ? `\nContexte (photo / conversation) : ${contexte}` : ""}\nCatégorie : ${categorie}\nRéponse de Jacob : ${reponseJacob}${correction ? "\n(Jacob corrige une information existante.)" : ""}`,
    500,
    "structure",
  );
  const parsed = raw ? parseStructuredJson(raw) : null;
  if (parsed) {
    return correction ? { ...parsed, nature: "correction" } : parsed;
  }
  const fb = structureFallback({ question, reponseJacob, categorie, correction });
  // Sans IA, une réponse sur une photo n'est jamais généralisée : on la transmet, on ne la mémorise pas.
  return hasPhoto ? { ...fb, memoriser: false } : fb;
}

const JUDGE_SYSTEM = `Tu compares une connaissance EXISTANTE et une NOUVELLE réponse du directeur sur le même sujet. Réponds UNIQUEMENT par un mot :
meme (même contenu), precision (la nouvelle complète sans rien contredire), contradiction (valeur, condition ou oui/non différent : la nouvelle remplace), distinct (autre offre ou autre sujet).`;

async function judge(deps: DirectorDeps, existing: KnowledgeEntry, incoming: StructuredKnowledge): Promise<ConflictVerdict> {
  const raw = await askLlm(
    deps,
    JUDGE_SYSTEM,
    `EXISTANTE : ${existing.reponse} ${existing.conditions ? `(conditions : ${existing.conditions})` : ""}\nNOUVELLE : ${incoming.reponse} ${incoming.conditions ? `(conditions : ${incoming.conditions})` : ""}`,
    20,
    "judge",
  );
  const v = (raw ?? "").toLowerCase();
  for (const verdict of ["contradiction", "precision", "distinct", "meme"] as const) {
    if (v.includes(verdict)) return verdict;
  }
  return judgeConflictFallback(existing, incoming);
}

const REPLY_SYSTEM = `Tu es l'assistant WhatsApp d'ARBI JACOB. Le directeur vient de répondre à une question que tu ne savais pas traiter. Rédige la réponse au CLIENT : naturelle, chaleureuse, courte (2-4 phrases), tutoiement si le client tutoie. Reformule avec tes mots (pas de copier-coller). Respecte EXACTEMENT les conditions et montants du directeur. N'invente rien. Ne mentionne pas « le directeur a dit » ni ce fonctionnement interne : tu peux dire « j'ai vérifié ». Si la question portait sur une photo, rappelle brièvement l'article concerné d'après la description fournie. Réponds uniquement avec le message.`;

async function composeClientReply(deps: DirectorDeps, clientQuestion: string, k: StructuredKnowledge, jacobText: string, contexte = ""): Promise<string> {
  const raw = await askLlm(
    deps,
    REPLY_SYSTEM,
    `Question du client : ${clientQuestion}${contexte ? `\nPhoto / contexte : ${contexte}` : ""}\nRéponse validée : ${k.reponse}\nConditions : ${k.conditions || "aucune"}\nExceptions : ${k.exceptions || "aucune"}\nTexte original du directeur : ${jacobText}`,
    400,
    "reply",
  );
  if (raw) return raw.slice(0, 1200);
  // Repli sans IA : la connaissance structurée, conditions comprises.
  return `J'ai vérifié 👍 ${k.reponse}${k.conditions ? ` ${k.conditions}` : ""}`.slice(0, 1200);
}

async function deliverToClient(deps: DirectorDeps, waId: string, text: string): Promise<LinkDelivery> {
  const { core, wa, log } = deps;
  const contact = core.contacts.get(waId);
  // Jacob a repris la main sur cette conversation : le bot ne parle pas à sa place.
  if (contact?.modeHumain) return "mode_humain";
  if (contact?.optOut) return "echec";

  const result = await wa.sendText(waId, text);
  if (result.sent) {
    core.messages.insert(waId, "assistant", text, result.messageId ?? null);
    return "envoyee";
  }
  if (result.reason === "outside_24h_window") {
    const name = core.settings.get("relance_template_name").trim();
    if (name) {
      const lang = contact?.langue || "fr";
      const viaTemplate = await wa.sendTemplate(waId, name, lang, [
        { type: "body", parameters: [{ type: "text", text: flattenTemplateParam(text, 900) }] },
      ]);
      if (viaTemplate.sent) {
        core.messages.insert(waId, "assistant", `[Relance envoyée] ${text}`, viaTemplate.messageId ?? null);
        return "envoyee";
      }
    }
    return "fenetre_fermee";
  }
  logDecision(log, "director_reply_delivery_failed", { waId, reason: result.reason });
  return "echec";
}

export interface DirectorReplyInput {
  adminWaId: string;
  text: string;
  /** `context.id` du webhook : le message auquel Jacob répond. */
  replyToWamid?: string;
}

export interface DirectorReplyResult {
  /** false → le message n'a rien à voir avec le Manager IA (traitement habituel). */
  handled: boolean;
  escalationId?: number;
  entryId?: number | null;
  delivered?: number;
}

function jacobConfirm(deps: DirectorDeps, adminWaId: string, text: string): Promise<unknown> {
  return deps.wa.sendText(adminWaId, text, { manual: true });
}

/** Enregistre (ou met à jour) la connaissance et renvoie son id, ou null si le contenu est refusé. */
async function learn(
  deps: DirectorDeps,
  k: StructuredKnowledge,
  ctx: { question: string; jacobText: string; escalationId: number | null; source: "jacob" | "correction" },
): Promise<{ entryId: number | null; action: string }> {
  const { core } = deps;
  const reject = knowledgeRejectReason([k.reponse, k.conditions, k.exceptions, k.intention]);
  if (reject) {
    logDecision(deps.log, "knowledge_rejected", { reason: reject });
    return { entryId: null, action: `non mémorisé (${reject})` };
  }
  const thresholds = thresholdsFrom(core);
  const matches = bestMatches(core.knowledge.entries.active(), ctx.question, {}, 3).filter(
    (m) => confidenceLevel(m.score, thresholds) !== "faible",
  );
  const input = {
    sujet: k.sujet,
    theme: k.theme,
    categorie: k.categorie,
    offreCle: k.offreCle,
    intention: k.intention,
    reponse: k.reponse,
    conditions: k.conditions,
    exceptions: k.exceptions,
    source: ctx.source,
    escalationId: ctx.escalationId,
    questionOrigine: ctx.question,
    reponseJacob: ctx.jacobText,
  };
  const top = matches[0]?.entry;
  if (top) {
    const verdict = await judge(deps, top, k);
    if (verdict === "meme") {
      core.knowledge.entries.addVariant(top.id, ctx.question);
      return { entryId: top.id, action: "déjà connu — formulation ajoutée" };
    }
    if (verdict === "precision") {
      core.knowledge.entries.update(
        top.id,
        {
          reponse: k.reponse,
          conditions: k.conditions || top.conditions,
          exceptions: k.exceptions || top.exceptions,
        },
        { action: "mise_a_jour", source: ctx.source, raison: "précision apportée par Jacob" },
      );
      core.knowledge.entries.addVariant(top.id, ctx.question);
      return { entryId: top.id, action: "précisé" };
    }
    if (verdict === "contradiction") {
      const newId = core.knowledge.entries.replace(top.id, input, `Jacob prime : « ${top.reponse} » remplacé par « ${k.reponse} »`);
      return { entryId: newId, action: "remplace l'ancienne information (historique conservé)" };
    }
  }
  const id = core.knowledge.entries.add(input, "réponse de Jacob");
  return { entryId: id, action: "nouvelle connaissance" };
}

/** Accusés de réception : jamais rattachés d'office à une demande. */
const TRIVIAL_RE = /^((ok|oui|non|merci|beaucoup|d'?accord|top|parfait|super|vu|reçu|recu|👍|🙏|salut|bonjour|hello|bien|noté|note)[\s.!,]*)+$/i;

export type Picked = { esc?: EscalationRow; closed?: EscalationRow; ambiguous?: EscalationRow[] };

/**
 * Retrouve LA demande concernée. Règle d'or : le message cité (context.id) est l'identifiant.
 * Sans message cité : jamais de devinette s'il y a plusieurs demandes ouvertes.
 */
export function pickEscalation(core: Core, input: DirectorReplyInput): Picked {
  const kb = core.knowledge.escalations;
  if (input.replyToWamid) {
    const hit = kb.byWamid(input.replyToWamid);
    if (hit && hit.statut === "en_attente") return { esc: hit };
    if (hit) return { closed: hit }; // réponse à une demande déjà traitée = correction
    return {}; // citation d'un autre message : traitement habituel
  }
  const open = kb.open();
  if (open.length === 1 && !TRIVIAL_RE.test(input.text.trim())) return { esc: open[0] };
  if (open.length > 1) return { ambiguous: open };
  return {};
}

export async function handleDirectorReply(deps: DirectorDeps, input: DirectorReplyInput): Promise<DirectorReplyResult> {
  const { core, log } = deps;
  const text = input.text.trim();
  if (!text) return { handled: false };

  // ── Correction spontanée : « Correction : le délai passe à 15 jours » ──
  if (CORRECTION_RE.test(text) && !(input.replyToWamid && core.knowledge.escalations.byWamid(input.replyToWamid))) {
    const body = text.replace(CORRECTION_RE, "").trim();
    if (!body) return { handled: false };
    const k = await structure(deps, body, body, "Autre", true);
    const outcome = await learn(deps, { ...k, intention: k.intention || body }, {
      question: k.intention || body,
      jacobText: text,
      escalationId: null,
      source: "correction",
    });
    await jacobConfirm(deps, input.adminWaId, `✅ Correction prise en compte : ${outcome.action}.`);
    logDecision(log, "director_correction", { entryId: outcome.entryId, action: outcome.action });
    return { handled: true, entryId: outcome.entryId };
  }

  const picked = pickEscalation(core, input);

  if (picked.ambiguous) {
    // Plusieurs demandes ouvertes sans « Répondre » : on ne devine JAMAIS, on demande.
    const list = picked.ambiguous
      .slice(0, 5)
      .map((e, i) => {
        const name = core.contacts.get(e.waId)?.nom || `+${e.waId}`;
        return `${i + 1}. ${name} — “${e.question.slice(0, 70)}”${e.mediaFile ? " 📷" : ""}`;
      })
      .join("\n");
    await jacobConfirm(
      deps,
      input.adminWaId,
      `J'ai ${picked.ambiguous.length} questions en attente :\n${list}\n\nAppuie longuement sur la question concernée puis « Répondre », pour que je sache laquelle. Je n'ai rien envoyé aux clients.`,
    );
    logDecision(log, "director_reply_ambiguous", { open: picked.ambiguous.length });
    return { handled: true };
  }

  if (picked.closed) {
    // Réponse (par « Répondre ») à une demande déjà traitée : correction de ce qui a été retenu, aucun nouveau message client.
    const c = picked.closed;
    const k = await structure(deps, c.question, text, c.categorie, true, c.contexte, !!c.mediaFile);
    if (k.memoriser === false) {
      await jacobConfirm(deps, input.adminWaId, "Noté, mais cette demande est déjà traitée : je n'ai rien changé dans ce que je retiens.");
      return { handled: true, escalationId: c.id };
    }
    const outcome = await learn(deps, k, { question: c.question, jacobText: text, escalationId: c.id, source: "correction" });
    await jacobConfirm(deps, input.adminWaId, `✅ Correction prise en compte : ${outcome.action}. (Les clients déjà servis ne sont pas re-contactés.)`);
    return { handled: true, escalationId: c.id, entryId: outcome.entryId };
  }

  const esc = picked.esc;
  if (!esc) return { handled: false };
  const kb = core.knowledge.escalations;
  const hasPhoto = !!esc.mediaFile;

  const k = await structure(deps, esc.question, text, esc.categorie, false, esc.contexte, hasPhoto);
  let outcome: { entryId: number | null; action: string } = { entryId: null, action: "non mémorisé (réponse propre à ce cas)" };
  if (k.memoriser !== false) {
    outcome = await learn(deps, k, { question: esc.question, jacobText: text, escalationId: esc.id, source: "jacob" });
  }
  // Statut « répondu » : la réponse est bien reliée à CETTE demande.
  kb.markAnswered(esc.id, { reponseJacob: text, entryId: outcome.entryId });

  // Répondre à TOUTES les conversations rattachées à la demande (déduplication), avec SON contexte.
  let delivered = 0;
  let handledByHuman = 0;
  for (const link of kb.links(esc.id)) {
    const reply = await composeClientReply(deps, link.question, k, text, esc.contexte);
    const status = await deliverToClient(deps, link.waId, reply);
    kb.markDelivery(link.id, status, reply);
    if (status === "envoyee") delivered++;
    if (status === "mode_humain") handledByHuman++;
  }
  if (delivered + handledByHuman > 0) {
    kb.resolve(esc.id, { reponseJacob: text, entryId: outcome.entryId });
  } else {
    kb.fail(esc.id);
  }
  logDecision(log, "escalation_resolved", { escalationId: esc.id, entryId: outcome.entryId, delivered, action: outcome.action });
  const learned = outcome.entryId ? `je retiens : ${outcome.action}` : outcome.action;
  await jacobConfirm(
    deps,
    input.adminWaId,
    delivered > 0
      ? `✅ Merci Jacob ! J'ai répondu à ${delivered} client${delivered > 1 ? "s" : ""} — ${learned}.`
      : handledByHuman > 0
        ? `✅ Merci Jacob, bien noté (${learned}). Le client est en mode humain : je ne lui ai pas écrit.`
        : `⚠️ Merci Jacob, mais je n'ai pas pu envoyer ta réponse au client (fenêtre WhatsApp fermée ou échec d'envoi). La demande est marquée en erreur dans le dashboard.`,
  );
  return { handled: true, escalationId: esc.id, entryId: outcome.entryId, delivered };
}
