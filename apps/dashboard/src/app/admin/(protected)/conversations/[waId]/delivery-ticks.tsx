import type { DeliveryInfo } from "@arbi/core";

/**
 * Coches « façon WhatsApp » sous chaque message SORTANT (bot, Jacob, relances).
 * Tout vient des événements réellement remontés par Meta : jamais de « lu » inventé.
 * - pas de wamid (message ancien) : aucune coche, on n'affirme rien ;
 * - wamid mais aucun accusé reçu encore : une coche grise (accepté par WhatsApp) ;
 * - sent / delivered / read / failed : selon l'événement Meta.
 */
const GREY = "#8696a0";
const BLUE = "#53bdeb";

function Check({ color, offset = 0 }: { color: string; offset?: number }) {
  return (
    <path
      d="M1.5 8.2 5 11.6 11.6 3.4"
      transform={`translate(${offset} 0)`}
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function formatAt(ts: number): string {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function DeliveryTicks({ wamid, info }: { wamid: string | null; info: DeliveryInfo | undefined }) {
  if (!wamid) return null;

  if (info?.status === "failed") {
    const detail = info.errorMessage ? ` — ${info.errorMessage}` : info.errorCode ? ` (code ${info.errorCode})` : "";
    return (
      <div
        className="mt-0.5 flex items-center justify-end gap-1 text-[11px] font-medium text-red-600"
        title={`Message non envoyé${detail}`}
        role="img"
        aria-label={`Message non envoyé${detail}`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.2v4.6M8 11.3v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        Non envoyé
      </div>
    );
  }

  const status = info?.status ?? "accepted";
  const double = status === "delivered" || status === "read";
  const read = status === "read";
  const label =
    status === "read"
      ? `Lu${info?.readAt ? ` à ${formatAt(info.readAt)}` : ""}`
      : status === "delivered"
        ? `Reçu${info?.deliveredAt ? ` à ${formatAt(info.deliveredAt)}` : ""}`
        : "Envoyé";

  return (
    <div
      className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-neutral-400"
      title={label}
      role="img"
      aria-label={label}
    >
      {read && info?.readAt ? <span className="font-medium">{formatAt(info.readAt)}</span> : null}
      <svg width={double ? 18 : 14} height="14" viewBox={`0 0 ${double ? 18 : 14} 14`} aria-hidden="true">
        <Check color={read ? BLUE : GREY} />
        {double ? <Check color={read ? BLUE : GREY} offset={5} /> : null}
      </svg>
    </div>
  );
}
