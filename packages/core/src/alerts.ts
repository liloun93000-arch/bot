import type Anthropic from "@anthropic-ai/sdk";
import type { AdminNumber, Core } from "./db";
import { NO_BLOCKAGE_RE, PROTECTED_MOTIF_RE, STALL_MOTIF_RE } from "./alerts-audit";
import { isRealQuestion } from "./categories";
import { summarizeConversation } from "./llm";
import { isSubjectlessRequest } from "./qualification";
import type { Logger } from "./logger";
import { logDecision } from "./logger";
import type { WhatsAppClient } from "./whatsapp";

export interface AlertInput {
  waId: string;
  motif: string;
  intention: string;
  categorie: string;
  dernierMessage: string;
  /** Demande EXPLICITE du client (bouton 🔔, « je veux parler à Jacob ») : jamais filtrée par le garde-fou. */
  explicite?: boolean;
}

export type AlertSkipReason = "sujet_inconnu" | "echanges_sans_progression" | "doublon" | "aucun_blocage" | "ogf";

/** OG Factory (« OGF », « OGFACTORY ») : revendeur indépendant, jamais une alerte pour Jacob. */
export const OGF_RE = /(?<![a-z0-9])(?:og[\s-]*factory|ogf)(?![a-z0-9])/i;

export interface AlertDeps {
  core: Core;
  wa: WhatsAppClient;
  llm: Anthropic;
  model: string;
  log: Logger;
  /** Repli e-mail (facultatif) : clé API Resend + expéditeur. */
  resendApiKey?: string;
  emailFrom?: string;
  fetchFn?: typeof fetch;
}

/** Une seule ligne : les paramètres de template WhatsApp refusent les sauts de ligne. */
export function flattenTemplateParam(text: string, max = 550): string {
  return text.replace(/\s*\n+\s*/g, " · ").replace(/\s+/g, " ").trim().slice(0, max) || "—";
}

export function formatAlertText(input: {
  clientLabel: string;
  categorie: string;
  intention: string;
  resume: string;
  motif: string;
  dernierMessage: string;
  dashboardUrl: string;
  waId: string;
}): string {
  const lien = input.dashboardUrl
    ? `\n\n→ Reprendre : ${input.dashboardUrl.replace(/\/$/, "")}/conversations/${input.waId}`
    : "";
  return `🔔 NOUVELLE ALERTE — ARBI JACOB

Client : ${input.clientLabel}
Catégorie : ${input.categorie}
Intention : ${input.intention || "—"}

Résumé : ${input.resume}
Blocage : ${input.motif}
Dernier message : « ${input.dernierMessage} »${lien}`;
}

async function sendEmailFallback(
  deps: AlertDeps,
  subject: string,
  text: string,
): Promise<boolean> {
  const to = deps.core.settings.get("alert_email_to");
  if (!deps.resendApiKey || !to) return false;
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const response = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deps.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: deps.emailFrom || "alerte@arbijacob.local",
        to: [to],
        subject,
        text,
      }),
    });
    return response.ok;
  } catch (err) {
    deps.log.error({ err: String(err) }, "alert_email_failed");
    return false;
  }
}

const SKIP_LOG: Record<AlertSkipReason, string> = {
  sujet_inconnu: "le sujet du client n'est pas encore connu : question de qualification, pas d'alerte",
  echanges_sans_progression: "échanges sans progression : jamais un blocage",
  doublon: "même demande déjà signalée dans les dernières 24 h",
  ogf: "OG Factory : revendeur indépendant, le bot redirige vers leurs coordonnées sans alerte",
  aucun_blocage: "le résumé indique qu'aucun blocage n'existe",
};

const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** L'alerte correspond-elle à un vrai besoin humain (exigé par le client, ou information réellement manquante) ? */
export function isAlertProtected(input: AlertInput): boolean {
  if (input.explicite) return true;
  if (PROTECTED_MOTIF_RE.test(input.motif)) return true;
  // Le bot ne sait pas répondre à une VRAIE question précise : Jacob doit trancher.
  return /^Jacob doit reprendre la conversation/i.test(input.motif) && isRealQuestion(input.dernierMessage) && !isSubjectlessRequest(input.dernierMessage);
}

/**
 * Garde-fou AVANT toute création (aucun appel IA) : rien n'est créé si le client est resté vague, si la demande
 * a déjà été signalée, ou si le motif est un simple « échanges sans progression ».
 */
export function precheckAlert(core: Core, input: AlertInput, now = Date.now()): AlertSkipReason | null {
  const dup = core.sqlite
    .prepare(`SELECT dernier_message AS dm, motif FROM alerts WHERE wa_id = ? AND created_at >= ? ORDER BY id DESC LIMIT 5`)
    .all(input.waId, now - 24 * 3_600_000) as Array<{ dm: string; motif: string }>;
  const last = norm(input.dernierMessage).slice(0, 120);
  if (last && dup.some((d) => norm(d.dm ?? "").slice(0, 120) === last)) return "doublon";
  if (input.explicite !== true && OGF_RE.test(`${input.dernierMessage} ${input.motif}`)) return "ogf";
  if (isAlertProtected(input)) return null;
  if (STALL_MOTIF_RE.test(input.motif)) return "echanges_sans_progression";
  const serviceEnCours = core.state.get(input.waId).serviceEnCours;
  if (!serviceEnCours && isSubjectlessRequest(input.dernierMessage)) return "sujet_inconnu";
  return null;
}

/**
 * Déclenche une alerte : enregistrement, résumé automatique, notification
 * WhatsApp admin (template → texte libre → e-mail), bascule en attente.
 * Idempotent : si une alerte est déjà ouverte pour le contact, ne re-notifie pas.
 */
export async function triggerAlert(
  deps: AlertDeps,
  input: AlertInput,
): Promise<{ alertId: number; notifiedVia: string; deduped: boolean; skipped?: AlertSkipReason }> {
  const { core, log } = deps;

  if (core.alerts.hasOpenFor(input.waId)) {
    const existing = core.alerts.open().find((a) => a.waId === input.waId);
    logDecision(log, "alert_deduped", { waId: input.waId, motif: input.motif });
    return { alertId: existing?.id ?? 0, notifiedVia: existing?.notifiedVia ?? "", deduped: true };
  }

  const skip = precheckAlert(core, input);
  if (skip) {
    logDecision(log, "alert_skipped", { waId: input.waId, raison: skip, detail: SKIP_LOG[skip], motif: input.motif });
    return { alertId: 0, notifiedVia: "", deduped: false, skipped: skip };
  }

  const contact = core.contacts.get(input.waId);
  const clientLabel = contact?.nom ? `${contact.nom} (+${input.waId})` : `+${input.waId}`;
  const transcript = core.messages.history(input.waId, 40);
  const resume = await summarizeConversation(deps.llm, deps.model, transcript, log, contact?.nom);
  // Ce résumé sert aussi au back-office : sans ça, Jacob ouvre la conversation
  // depuis l'alerte et déclenche aussitôt un second calcul quasi identique.
  core.state.setResume(input.waId, resume, core.messages.lastMessageId(input.waId));

  // Cohérence résumé / motif / décision : si le résumé établi sur la conversation réelle dit lui-même qu'il n'y a
  // aucun blocage, aucune intervention humaine n'est nécessaire → pas d'alerte (sauf demande explicite ou motif protégé).
  if (!isAlertProtected(input) && NO_BLOCKAGE_RE.test(resume)) {
    logDecision(log, "alert_skipped", { waId: input.waId, raison: "aucun_blocage", detail: SKIP_LOG.aucun_blocage, motif: input.motif });
    return { alertId: 0, notifiedVia: "", deduped: false, skipped: "aucun_blocage" };
  }

  const alertId = core.alerts.create({
    waId: input.waId,
    categorie: input.categorie,
    intention: input.intention,
    motif: input.motif,
    resume,
    dernierMessage: input.dernierMessage,
  });
  core.contacts.setStatut(input.waId, "alerte");
  logDecision(log, "alert_created", { waId: input.waId, alertId, motif: input.motif });

  const dashboardUrl = core.settings.get("dashboard_url");
  const templateName = core.settings.get("alert_template_name");
  const fullText = formatAlertText({
    clientLabel,
    categorie: input.categorie,
    intention: input.intention,
    resume,
    motif: input.motif,
    dernierMessage: input.dernierMessage,
    dashboardUrl,
    waId: input.waId,
  });

  const admins = core.settings.get("admin_numbers") as AdminNumber[];
  const active = admins.filter((a) => a.actif && a.number);
  const channels: string[] = [];

  for (const admin of active) {
    const adminWaId = admin.number.replace(/[^\d]/g, "");

    // 1) Template approuvé (seul canal fiable hors fenêtre 24 h).
    // Meta rejette un corps HYDRATÉ > 1024 caractères (erreur 132018) : on
    // budgétise le résumé en fonction des autres paramètres + texte fixe.
    const TEMPLATE_BODY_FIXED = 113; // longueur du texte fixe du template alerte_admin
    const p1 = flattenTemplateParam(clientLabel, 80);
    const p2 = flattenTemplateParam(input.categorie, 40);
    const p3 = flattenTemplateParam(input.intention || "—", 40);
    const p5 = flattenTemplateParam(input.motif, 120);
    const p6 = flattenTemplateParam(input.dernierMessage, 200);
    const resumeBudget = Math.max(
      100,
      1024 - TEMPLATE_BODY_FIXED - (p1.length + p2.length + p3.length + p5.length + p6.length),
    );
    const p4 = flattenTemplateParam(resume, Math.min(550, resumeBudget));
    const templateLang = core.settings.get("alert_template_lang");
    const templateResult = await deps.wa.sendTemplate(adminWaId, templateName, templateLang, [
      {
        type: "body",
        parameters: [
          { type: "text", text: p1 },
          { type: "text", text: p2 },
          { type: "text", text: p3 },
          { type: "text", text: p4 },
          { type: "text", text: p5 },
          { type: "text", text: p6 },
        ],
      },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: input.waId }],
      },
    ]);
    if (templateResult.sent) {
      channels.push(`template:${adminWaId}`);
      continue;
    }

    // 2) Texte libre (fonctionne si l'admin a écrit au bot dans les 24 h)
    const textResult = await deps.wa.sendText(adminWaId, fullText);
    if (textResult.sent) {
      channels.push(`texte:${adminWaId}`);
      continue;
    }

    logDecision(log, "alert_whatsapp_notify_failed", {
      alertId,
      admin: adminWaId,
      template: templateResult.reason,
      texte: textResult.reason,
    });
  }

  // 3) Repli e-mail si aucun WhatsApp n'est passé
  if (channels.length === 0) {
    const emailed = await sendEmailFallback(deps, `🔔 Alerte ARBI JACOB — ${clientLabel}`, fullText);
    if (emailed) channels.push("email");
  }

  const notifiedVia = channels.join(",") || "aucune";
  core.alerts.setNotifiedVia(alertId, notifiedVia);
  logDecision(log, "alert_notified", { alertId, notifiedVia, admins: active.length });
  return { alertId, notifiedVia, deduped: false };
}
