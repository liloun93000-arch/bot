import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { listRelances, relanceConfig, relanceStats } from "@arbi/core";

export const dynamic = "force-dynamic";

const STATUT: Record<string, string> = {
  planifiee: "Planifiée",
  envoyee: "Envoyée",
  annulee: "Annulée",
  ignoree: "Non envoyée",
  echec: "Échec d'envoi",
};
const TICKS: Record<string, string> = { sent: "✓ envoyé", delivered: "✓✓ reçu", read: "✓✓ lu", failed: "⚠ échec" };

const fmt = (ts: number | null) =>
  ts ? new Date(ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }) : "—";

export default async function RelancesPage({ searchParams }: { searchParams: Promise<{ jours?: string }> }) {
  await requireSession();
  const { jours = "30" } = await searchParams;
  const nb = Math.min(365, Math.max(1, Number.parseInt(jours, 10) || 30));
  const { core } = getRuntime();
  const cfg = relanceConfig(core);
  const stats = relanceStats(core, Date.now() - nb * 86_400_000);
  const rows = listRelances(core, 150);
  const pct = stats.tauxReponse === null ? "—" : `${Math.round(stats.tauxReponse * 100)} %`;

  return (
    <div className="space-y-4">
      <div className="aj-lead-hero">
        <h1>🔁 Relances automatiques</h1>
        <p>
          État : <b>{cfg.actif ? "activées" : "désactivées"}</b> · relance après {Math.round(cfg.delaiMs / 3_600_000)} h de silence ·
          envoi entre {cfg.heureDebut} h et {cfg.heureFin} h ({cfg.fuseau}). Réglages dans{" "}
          <Link href="/admin/reglages" className="underline">Réglages</Link>.
        </p>
      </div>

      <div className="card p-4 grid gap-3 grid-cols-2 sm:grid-cols-4">
        {[
          ["Envoyées", stats.envoyees],
          ["Réponses du client", `${stats.reponses} (${pct})`],
          ["Lues (WhatsApp)", stats.lues],
          ["Fiches avancées après relance", stats.conversions],
          ["Planifiées", stats.planifiees],
          ["Annulées (client a répondu…)", stats.annulees],
          ["Non envoyées (règles)", stats.ignorees],
          ["Échecs d'envoi", stats.echecs],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Chiffres réels sur {nb} jours : uniquement des relances effectivement envoyées et des réponses reçues. « Lues » vient des accusés WhatsApp.
      </p>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="p-2">Client</th><th className="p-2">Statut</th><th className="p-2">Message</th>
              <th className="p-2">Date</th><th className="p-2">Réponse</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-slate-500">Aucune relance pour l&apos;instant.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="p-2">
                  <Link href={`/admin/conversations/${r.waId}?from=/admin/relances`} className="underline">{r.nom || r.waId}</Link>
                </td>
                <td className="p-2">
                  {STATUT[r.statut] ?? r.statut}
                  {r.motif && <div className="text-xs text-slate-500">{r.motif}</div>}
                  {r.deliveryStatus && <div className="text-xs">{TICKS[r.deliveryStatus] ?? r.deliveryStatus}</div>}
                </td>
                <td className="p-2 max-w-xs">{r.texte || "—"}{r.canal === "template" && <div className="text-xs text-slate-500">via template</div>}</td>
                <td className="p-2 whitespace-nowrap">{r.sentAt ? fmt(r.sentAt) : `prévue ${fmt(r.scheduledFor)}`}</td>
                <td className="p-2">{r.replyAt ? `✅ ${fmt(r.replyAt)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
