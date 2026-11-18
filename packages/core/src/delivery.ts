import type { RawDb } from "./db";

/**
 * Accusés WhatsApp des messages SORTANTS (coches du back-office).
 *
 * Source unique : les événements `statuses` réellement envoyés par Meta sur le
 * webhook. Rien n'est déduit ni simulé : sans événement « read », un message
 * n'est jamais présenté comme lu (le client peut avoir désactivé les accusés).
 *
 * Table indexée par wamid, distincte de `messages` : l'événement « sent » de
 * Meta peut arriver avant que le message soit enregistré en base.
 */
export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";

export interface DeliveryEvent {
  wamid: string;
  status: DeliveryStatus;
  /** Horodatage Meta de l'événement, en ms. */
  ts: number;
  waId?: string;
  errorCode?: number;
  errorMessage?: string;
}

export interface DeliveryInfo {
  wamid: string;
  status: DeliveryStatus;
  sentAt: number | null;
  deliveredAt: number | null;
  readAt: number | null;
  errorCode: number | null;
  errorMessage: string;
}

const RANK: Record<DeliveryStatus, number> = { failed: 0, sent: 1, delivered: 2, read: 3 };

interface Row {
  wamid: string;
  wa_id: string | null;
  status: string;
  sent_at: number | null;
  delivered_at: number | null;
  read_at: number | null;
  error_code: number | null;
  error_message: string | null;
}

function toInfo(row: Row): DeliveryInfo {
  return {
    wamid: row.wamid,
    status: row.status as DeliveryStatus,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    errorCode: row.error_code,
    errorMessage: row.error_message ?? "",
  };
}

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return value === "sent" || value === "delivered" || value === "read" || value === "failed";
}

export function createDelivery(sqlite: RawDb, now: () => number = Date.now) {
  const select = sqlite.prepare(`SELECT * FROM message_delivery WHERE wamid = ?`);

  return {
    /**
     * Applique un événement Meta. Les événements arrivent parfois dans le
     * désordre : le statut ne régresse jamais (read > delivered > sent), et un
     * échec n'écrase pas un message déjà délivré.
     */
    record(event: DeliveryEvent): void {
      if (!event.wamid) return;
      {
        // Lecture puis écriture dans le même tick synchrone : seul le webhook du
        // bot écrit cette table, aucune course possible.
        const existing = select.get(event.wamid) as Row | undefined;
        const sentAt = existing?.sent_at ?? (event.status === "sent" ? event.ts : null);
        const deliveredAt = existing?.delivered_at ?? (event.status === "delivered" ? event.ts : null);
        const readAt = existing?.read_at ?? (event.status === "read" ? event.ts : null);

        let status: DeliveryStatus = event.status;
        let errorCode = existing?.error_code ?? null;
        let errorMessage = existing?.error_message ?? "";
        if (existing) {
          const current = existing.status as DeliveryStatus;
          if (event.status === "failed") {
            // Déjà délivré ou lu : un « failed » tardif n'annule pas la réalité.
            status = RANK[current] >= 2 ? current : "failed";
          } else if (current === "failed") {
            // L'échec ne se corrige que par une vraie délivrance.
            status = RANK[event.status] >= 2 ? event.status : "failed";
          } else {
            status = RANK[event.status] > RANK[current] ? event.status : current;
          }
        }
        if (event.status === "failed" && status === "failed") {
          errorCode = event.errorCode ?? errorCode;
          errorMessage = event.errorMessage ?? errorMessage;
        }

        sqlite
          .prepare(
            `INSERT INTO message_delivery
               (wamid, wa_id, status, sent_at, delivered_at, read_at, error_code, error_message, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(wamid) DO UPDATE SET
               wa_id = CASE WHEN excluded.wa_id <> '' THEN excluded.wa_id ELSE message_delivery.wa_id END,
               status = excluded.status,
               sent_at = excluded.sent_at,
               delivered_at = excluded.delivered_at,
               read_at = excluded.read_at,
               error_code = excluded.error_code,
               error_message = excluded.error_message,
               updated_at = excluded.updated_at`,
          )
          .run(
            event.wamid,
            event.waId ?? existing?.wa_id ?? "",
            status,
            sentAt,
            deliveredAt,
            readAt,
            errorCode,
            errorMessage,
            now(),
          );
      }
    },

    /** Statuts de plusieurs messages d'un coup (affichage d'une conversation). */
    many(wamids: string[]): Map<string, DeliveryInfo> {
      const out = new Map<string, DeliveryInfo>();
      const unique = [...new Set(wamids.filter(Boolean))];
      // SQLite limite le nombre de paramètres : on découpe.
      for (let i = 0; i < unique.length; i += 400) {
        const chunk = unique.slice(i, i + 400);
        const rows = sqlite
          .prepare(`SELECT * FROM message_delivery WHERE wamid IN (${chunk.map(() => "?").join(",")})`)
          .all(...chunk) as Row[];
        for (const row of rows) out.set(row.wamid, toInfo(row));
      }
      return out;
    },

    get(wamid: string): DeliveryInfo | undefined {
      const row = select.get(wamid) as Row | undefined;
      return row ? toInfo(row) : undefined;
    },
  };
}

/** Rang d'affichage des coches : 0 = rien d'affirmable, 1 = envoyé, 2 = reçu, 3 = lu. */
export function ticksOf(status: DeliveryStatus | "accepted" | undefined): 0 | 1 | 2 | 3 {
  if (status === "read") return 3;
  if (status === "delivered") return 2;
  if (status === "sent" || status === "accepted") return 1;
  return 0;
}
