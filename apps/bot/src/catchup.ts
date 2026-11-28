/**
 * Rattrapage : répond aux clients dont le DERNIER message est resté sans réponse (panne de l'IA, crédit épuisé…).
 * Garde-fous : seulement fenêtre 24 h encore ouverte (sinon WhatsApp refuserait), pas les désinscrits, pas les
 * conversations reprises par un humain, pas le numéro du directeur, une seule fois par message (verrou),
 * les clients sont traités l'un après l'autre avec une pause pour ne pas saturer l'IA.
 */
import type { Core } from "@arbi/core";
import type { InboundItem } from "./queue";

export interface CatchupDeps {
  core: Core;
  push: (waId: string, item: InboundItem) => void;
  isDirector: (waId: string) => boolean;
  log: { info: (msg: string) => void };
  now?: number;
  pauseMs?: number;
}

const WINDOW_MS = 24 * 3600_000 - 10 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function answerUnanswered(deps: CatchupDeps): Promise<{ relances: number; horsFenetre: number; ignores: number }> {
  const { core } = deps;
  const now = deps.now ?? Date.now();
  const out = { relances: 0, horsFenetre: 0, ignores: 0 };
  const rows = core.sqlite
    .prepare(
      `SELECT m.wa_id AS waId, m.id AS id, m.ts AS ts
         FROM messages m
        WHERE m.id = (SELECT MAX(id) FROM messages WHERE wa_id = m.wa_id)
          AND m.role = 'user' AND m.ts >= ?
        ORDER BY m.ts`,
    )
    .all(now - 10 * 24 * 3600_000) as Array<{ waId: string; id: number; ts: number }>;

  for (const r of rows) {
    const c = core.contacts.get(r.waId);
    if (!c || c.optOut || c.modeHumain || deps.isDirector(r.waId)) { out.ignores++; continue; }
    if (now - r.ts > WINDOW_MS) { out.horsFenetre++; continue; }
    if (!core.sends.claim(`catchup:${r.id}`)) { out.ignores++; continue; }
    // Tous les messages clients arrivés depuis la dernière réponse, dans l'ordre.
    const texts = core.sqlite
      .prepare(
        `SELECT contenu FROM messages WHERE wa_id = ? AND role = 'user'
            AND id > COALESCE((SELECT MAX(id) FROM messages WHERE wa_id = ? AND role <> 'user'), 0)
          ORDER BY id`,
      )
      .all(r.waId, r.waId) as Array<{ contenu: string }>;
    const text = texts.map((t) => t.contenu).join("\n").trim();
    if (!text) { out.ignores++; continue; }
    deps.push(r.waId, { text, ...(c.nom ? { profileName: c.nom } : {}) });
    out.relances++;
    await sleep(deps.pauseMs ?? 4000);
  }
  deps.log.info(`catchup_report a_repondre=${out.relances} hors_fenetre=${out.horsFenetre} ignores=${out.ignores}`);
  return out;
}
