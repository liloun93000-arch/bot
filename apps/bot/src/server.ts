import {
  isDeliveryStatus,
  logDecision,
  mediaPlaceholder,
  verifySignature,
  type Core,
  type Logger,
  type ProcessedMedia,
} from "@arbi/core";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import type { InboundItem } from "./queue";

export interface ServerConfig {
  VERIFY_TOKEN: string;
  APP_SECRET: string;
}

export interface InboundQueue {
  push(waId: string, item: InboundItem): void;
}

export interface ServerDeps {
  config: ServerConfig;
  core: Core;
  queue: InboundQueue;
  log: Logger;
  /** Télécharge, archive et transcrit un média entrant (photos, vocaux). */
  processMedia?: (input: {
    wamid: string;
    mediaId: string;
    type: string;
    caption?: string;
  }) => Promise<ProcessedMedia>;
}

const webhookMessageSchema = z.looseObject({
  id: z.string(),
  from: z.string(),
  timestamp: z.string().optional(),
  type: z.string(),
  context: z.looseObject({ id: z.string().optional() }).optional(),
  text: z.looseObject({ body: z.string() }).optional(),
  interactive: z
    .looseObject({
      type: z.string().optional(),
      list_reply: z.looseObject({ id: z.string(), title: z.string() }).optional(),
      button_reply: z.looseObject({ id: z.string(), title: z.string() }).optional(),
    })
    .optional(),
  button: z.looseObject({ text: z.string().optional() }).optional(),
  image: z.looseObject({ id: z.string().optional(), caption: z.string().optional() }).optional(),
  audio: z.looseObject({ id: z.string().optional(), voice: z.boolean().optional() }).optional(),
  voice: z.looseObject({ id: z.string().optional() }).optional(),
  video: z.looseObject({ id: z.string().optional(), caption: z.string().optional() }).optional(),
  sticker: z.looseObject({ id: z.string().optional() }).optional(),
  document: z
    .looseObject({
      id: z.string().optional(),
      caption: z.string().optional(),
      filename: z.string().optional(),
    })
    .optional(),
});

/** Accusé Meta d'un message sortant : sent | delivered | read | failed. */
const webhookStatusSchema = z.looseObject({
  id: z.string().optional(),
  status: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  recipient_id: z.string().optional(),
  errors: z
    .array(z.looseObject({ code: z.number().optional(), title: z.string().optional(), message: z.string().optional() }))
    .optional(),
});

/**
 * Enregistre les accusés réellement remontés par WhatsApp. Un statut inconnu
 * (ex. « deleted », « warning ») est ignoré : on n'invente jamais une coche.
 */
export function recordStatuses(
  core: Pick<Core, "delivery">,
  statuses: z.infer<typeof webhookStatusSchema>[],
): number {
  let recorded = 0;
  for (const s of statuses) {
    if (!s.id || !isDeliveryStatus(s.status)) continue;
    const seconds = Number(s.timestamp);
    const err = s.errors?.[0];
    core.delivery.record({
      wamid: s.id,
      status: s.status,
      ts: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now(),
      ...(s.recipient_id ? { waId: s.recipient_id } : {}),
      ...(err?.code !== undefined ? { errorCode: err.code } : {}),
      ...(err ? { errorMessage: (err.message ?? err.title ?? "").slice(0, 300) } : {}),
    });
    recorded++;
  }
  return recorded;
}

const webhookSchema = z.looseObject({
  object: z.string(),
  entry: z
    .array(
      z.looseObject({
        changes: z
          .array(
            z.looseObject({
              field: z.string().optional(),
              value: z.looseObject({
                contacts: z
                  .array(
                    z.looseObject({
                      wa_id: z.string(),
                      profile: z.looseObject({ name: z.string().optional() }).optional(),
                    }),
                  )
                  .optional(),
                messages: z.array(webhookMessageSchema).optional(),
                statuses: z.array(webhookStatusSchema).optional(),
              }),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

type WebhookMessage = z.infer<typeof webhookMessageSchema>;

export interface InboundMedia {
  /** Identifiant du média chez Meta, à télécharger. */
  id: string;
  /** image | audio | video | document | sticker */
  type: string;
  caption?: string;
}

export function extractInbound(message: WebhookMessage): {
  text: string;
  buttonId?: string;
  media?: InboundMedia;
} {
  switch (message.type) {
    case "text":
      return { text: message.text?.body ?? "" };
    case "image":
    case "audio":
    case "voice":
    case "video":
    case "sticker":
    case "document": {
      // « voice » est la variante vocale d'audio : même traitement.
      const kind = message.type === "voice" ? "audio" : message.type;
      const payload = (message as Record<string, { id?: string; caption?: string } | undefined>)[
        message.type
      ];
      const id = payload?.id;
      const caption = payload?.caption;
      const attente =
        kind === "audio"
          ? "[Message vocal — transcription en cours…]"
          : `[${kind === "image" ? "Photo" : kind === "video" ? "Vidéo" : kind === "sticker" ? "Sticker" : "Document"} reçue — chargement…]`;
      if (!id) return { text: mediaPlaceholder(kind, caption) };
      return {
        text: attente,
        media: { id, type: kind, ...(caption ? { caption } : {}) },
      };
    }
    case "interactive": {
      const listReply = message.interactive?.list_reply;
      if (listReply) return { text: `[Choix menu] ${listReply.title}` };
      const buttonReply = message.interactive?.button_reply;
      if (buttonReply) {
        return { text: `[Bouton] ${buttonReply.title}`, buttonId: buttonReply.id };
      }
      return { text: "" };
    }
    case "button":
      return { text: message.button?.text ?? "" };
    case "reaction":
    case "system":
      // Ni un tour de conversation, ni une réouverture de la fenêtre 24 h.
      return { text: "" };
    default:
      return {
        text: `[Le client a envoyé un message de type "${message.type}" que tu ne peux pas lire — demande-lui poliment de préciser par écrit]`,
      };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { config, core, queue, log } = deps;
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });

  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req: FastifyRequest, body: Buffer, done) => {
      req.rawBody = body;
      if (body.length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body.toString("utf8")));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/webhook", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];
    if (mode === "subscribe" && token === config.VERIFY_TOKEN && challenge) {
      logDecision(log, "webhook_verified", {});
      return reply.code(200).type("text/plain").send(challenge);
    }
    logDecision(log, "webhook_verification_rejected", { mode });
    return reply.code(403).send({ error: "verification failed" });
  });

  app.post("/webhook", async (request, reply) => {
    const signature = request.headers["x-hub-signature-256"] as string | undefined;
    if (!request.rawBody || !verifySignature(config.APP_SECRET, request.rawBody, signature)) {
      logDecision(log, "webhook_rejected_signature", { hasSignature: Boolean(signature) });
      return reply.code(401).send({ error: "invalid signature" });
    }

    const parsed = webhookSchema.safeParse(request.body);
    if (!parsed.success) {
      log.warn({ issues: parsed.error.issues.slice(0, 3) }, "webhook_payload_unexpected");
      return reply.code(200).send({ received: true });
    }
    if (parsed.data.object !== "whatsapp_business_account") {
      return reply.code(200).send({ received: true });
    }

    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (value.statuses?.length) {
          try {
            const recorded = recordStatuses(core, value.statuses);
            log.debug({ count: value.statuses.length, recorded }, "statuses_received");
          } catch (err) {
            // Un accusé non enregistré ne doit jamais faire échouer le webhook.
            log.error({ err: String(err) }, "statuses_record_failed");
          }
        }
        if (!value.messages?.length) continue;

        const profileByWaId = new Map(
          (value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]),
        );

        for (const message of value.messages) {
          if (core.messages.hasWamid(message.id)) {
            logDecision(log, "duplicate_message_skipped", { wamid: message.id });
            continue;
          }
          const inbound = extractInbound(message);
          if (!inbound.text) {
            logDecision(log, "inbound_ignored", { waId: message.from, type: message.type });
            continue;
          }

          const ts = message.timestamp ? Number(message.timestamp) * 1000 : Date.now();
          const profileName = profileByWaId.get(message.from);
          core.contacts.upsert(message.from, profileName ?? null);
          // Insertion immédiate : l'ordre de la conversation et la déduplication
          // sont préservés même quand le média met du temps à arriver.
          core.messages.insert(message.from, "user", inbound.text, message.id, ts, {
            type: inbound.media?.type,
          });

          if (inbound.media && deps.processMedia) {
            const media = inbound.media;
            const waId = message.from;
            const wamid = message.id;
            // Le webhook répond tout de suite ; le bot n'est réveillé qu'une fois
            // la photo archivée / le vocal transcrit, pour qu'il réponde au contenu réel.
            void (async () => {
              const processed = await deps.processMedia!({
                wamid,
                mediaId: media.id,
                type: media.type,
                ...(media.caption ? { caption: media.caption } : {}),
              });
              core.messages.attachMedia(wamid, {
                contenu: processed.text,
                file: processed.mediaFile,
                mime: processed.mediaMime,
              });
              queue.push(waId, {
                text: processed.text,
                profileName,
                ...(message.context?.id ? { replyToWamid: message.context.id } : {}),
              });
              logDecision(log, "media_processed", {
                waId,
                wamid,
                type: media.type,
                transcrit: processed.transcribed,
                archive: Boolean(processed.mediaFile),
              });
            })().catch((err) => {
              log.error({ err: String(err), wamid }, "media_pipeline_failed");
              queue.push(waId, { text: mediaPlaceholder(media.type, media.caption), profileName });
            });
            continue;
          }

          queue.push(message.from, {
            text: inbound.text,
            profileName,
            ...(inbound.buttonId ? { buttonId: inbound.buttonId } : {}),
            ...(message.context?.id ? { replyToWamid: message.context.id } : {}),
          });
          logDecision(log, "inbound_queued", {
            waId: message.from,
            type: message.type,
            wamid: message.id,
            buttonId: inbound.buttonId,
          });
        }
      }
    }

    return reply.code(200).send({ received: true });
  });

  return app;
}
