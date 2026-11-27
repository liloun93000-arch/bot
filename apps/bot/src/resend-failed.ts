/**
 * Renvoi des messages sortants que Meta n'a pas pu livrer (erreur 131042 : problème de paiement du compte).
 * Garde-fous : jamais hors fenêtre de 24 h (Meta refuserait), jamais à un client désinscrit, jamais une réponse
 * du bot si la conversation est passée en mode humain, jamais si une réponse plus récente a déjà été livrée,
 * une seule fois par message (verrou), dans l'ordre d'origine.
 */
import type { Core } from "@arbi/core";

export interface ResendDeps {
  core: Core;
  sendText: (waId: string, text: string) => Promise<{ sent: boolean; messageId?: string | undefined; reason?: string | undefined }>;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  now?: number;
  pauseMs?: number;
  /** Ancienneté maximale d'un message à renvoyer. */
  maxAgeMs?: number;
}

export interface ResendReport {
  contacts: number;
  renvoyes: number;
  horsFenetre: number;
  ignores: number;
  echecs: number;
}

const WINDOW_MS = 24 * 3600_000 - 10 * 60_000; // marge de 10 min
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row { id: number; waId: string; role: string; contenu: string; wamid: string; ts: number }

export async function resendFailedMessages(deps: ResendDeps): Promise<ResendReport> {
  const { core, sendText, log } = deps;
  const now = deps.now ?? Date.now();
  const report: ResendReport = { contacts: 0, renvoyes: 0, horsFenetre: 0, ignores: 0, echecs: 0 };
  const since = now - (deps.maxAgeMs ?? 10 * 24 * 3600_000);

  const failed = core.sqlite
    .prepare(
      `SELECT m.id AS id, m.wa_id AS waId, m.role AS role, m.contenu AS contenu, m.wamid AS wamid, m.ts AS ts
         FROM messages m JOIN message_delivery d ON d.wamid = m.wamid
        WHERE m.role IN ('assistant','human') AND d.status = 'failed' AND d.error_code = 131042 AND m.ts >= ? AND m.contenu NOT LIKE '[%'
        ORDER BY m.wa_id, m.id`,
    )
    .all(since) as Row[];

  const byContact = new Map<string, Row[]>();
  for (const r of failed) byContact.set(r.waId, [...(byContact.get(r.waId) ?? []), r]);

  for (const [waId, rows] of byContact) {
    report.contacts++;
    const contact = core.contacts.get(waId);
    if (!contact || contact.optOut) { report.ignores += rows.length; continue; }

    // Une réponse plus récente déjà livrée/lue : tout ce qui précède est périmé.
    const lastOk = (core.sqlite
      .prepare(
        `SELECT MAX(m.id) AS id FROM messages m JOIN message_delivery d ON d.wamid = m.wamid
          WHERE m.wa_id = ? AND m.role IN ('assistant','human') AND d.status IN ('sent','delivered','read')`,
      )
      .get(waId) as { id: number | null } | undefined)?.id ?? 0;
    // Un humain (Jacob) a répondu depuis, sans passer par le bot : même règle, via les messages « human » plus récents.
    const pending = rows.filter((r) => r.id > lastOk);
    report.ignores += rows.length - pending.length;
    if (pending.length === 0) continue;

    const lastIn = core.messages.lastInboundTs(waId);
    if (lastIn === null || now - lastIn > WINDOW_MS) { report.horsFenetre += pending.length; continue; }

    for (const r of pending) {
      if (r.role === "assistant" && contact.modeHumain) { report.ignores++; continue; }
      if (!core.sends.claim(`resend:${r.wamid}`)) { report.ignores++; continue; }
      const res = await sendText(waId, r.contenu);
      if (!res.sent || !res.messageId) {
        core.sends.release(`resend:${r.wamid}`);
        report.echecs++;
        log.warn(`resend_failed to=${waId} reason=${res.reason ?? "?"}`);
        break; // inutile d'insister sur ce contact : on garde l'ordre
      }
      // Le message d'origine pointe maintenant vers l'envoi réussi : plus de « Non envoyé », pas de doublon.
      core.sqlite.prepare(`UPDATE messages SET wamid = ? WHERE id = ?`).run(res.messageId, r.id);
      report.renvoyes++;
      await sleep(deps.pauseMs ?? 700);
    }
  }
  log.info(`resend_failed_report contacts=${report.contacts} renvoyes=${report.renvoyes} hors_fenetre=${report.horsFenetre} ignores=${report.ignores} echecs=${report.echecs}`);
  return report;
}
