import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { CALL_LABEL, listBookings, type Booking } from "@/lib/bookings";
import { decideBookingAction } from "@/lib/actions";
import { parisYmd } from "@/lib/period";

export const dynamic = "force-dynamic";

const fmt = (b: Booking) => {
  const [y, m, d] = b.date.split("-");
  const jour = new Date(`${b.date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long" });
  return `${jour} ${d}/${m}/${y} à ${b.heure}`;
};

export default async function RendezVous({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requireSession();
  const { msg } = await searchParams;
  const all = listBookings(getRuntime().core, { depuis: parisYmd(Date.now()) });
  const attente = all.filter((b) => b.statut === "en_attente");
  const autres = all.filter((b) => b.statut !== "en_attente");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">📞 Rendez-vous</h1>
        <p className="text-sm text-neutral-500">
          Réservations d&apos;appel faites sur le site. Approuver envoie la confirmation au client sur WhatsApp ; refuser libère le créneau (rien n&apos;est envoyé).
        </p>
      </div>
      {msg && <div className="card text-sm font-medium">{msg}</div>}

      <h2 className="font-semibold">À valider ({attente.length})</h2>
      {attente.length === 0 && <div className="card text-sm text-neutral-400">Aucun rendez-vous en attente.</div>}
      {attente.map((b) => (
        <article key={b.id} className="card space-y-2" style={{ borderLeft: "4px solid #ffb020" }}>
          <p className="font-semibold">
            {b.nom} · <span className="text-neutral-400">+{b.waId}</span>
          </p>
          <p className="text-sm">
            <b>{fmt(b)}</b> (heure de Paris) — {CALL_LABEL[b.type]}
          </p>
          {b.sujet && <p className="text-sm text-neutral-400">Sujet : {b.sujet}</p>}
          <div className="flex flex-wrap gap-2">
            <form action={decideBookingAction.bind(null, b.id, "approuve")}>
              <button type="submit" className="btn btn-primary">✅ Approuver</button>
            </form>
            <form action={decideBookingAction.bind(null, b.id, "refuse")}>
              <button type="submit" className="btn btn-secondary">✕ Refuser</button>
            </form>
            <Link href={`/admin/conversations/${b.waId}?from=${encodeURIComponent("/admin/rendez-vous")}`} className="btn btn-secondary">
              Conversation
            </Link>
          </div>
        </article>
      ))}

      {autres.length > 0 && (
        <>
          <h2 className="font-semibold">À venir — déjà traités</h2>
          {autres.map((b) => (
            <article key={b.id} className="card flex flex-wrap items-center justify-between gap-2" style={{ borderLeft: `4px solid ${b.statut === "approuve" ? "#25d366" : "#555b66"}`, opacity: b.statut === "refuse" ? 0.6 : 1 }}>
              <div className="min-w-0">
                <p className="font-semibold">{b.nom}</p>
                <p className="text-xs text-neutral-500">
                  {fmt(b)} · {b.type === "1h" ? "1 h (25 €)" : "15 min"}
                </p>
              </div>
              <span className="text-sm font-semibold">{b.statut === "approuve" ? "✅ Approuvé" : "✕ Refusé"}</span>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
