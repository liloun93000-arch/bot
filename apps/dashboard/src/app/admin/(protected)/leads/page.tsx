import Link from "next/link";
import { LEAD_STATUTS } from "@/lib/constants";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { StatutSelect } from "./statut-select";

export const dynamic = "force-dynamic";

const STATUTS = LEAD_STATUTS;
const STATUT_LABEL: Record<string, string> = {
  nouveau: "Nouveau",
  en_cours: "En cours",
  devis_envoye: "Devis envoyé",
  gagne: "Gagné",
  perdu: "Perdu",
};

const OPTIONS = STATUTS.map((value) => ({ value, label: STATUT_LABEL[value] ?? value }));

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  await requireSession();
  const { statut: filtre = "" } = await searchParams;
  const { core } = getRuntime();
  const tous = core.leads.list();
  const leads = filtre ? tous.filter((lead) => lead.statut === filtre) : tous;
  const compte = (valeur: string) => tous.filter((lead) => lead.statut === valeur).length;

  // Les plus urgents d'abord : nouveaux, puis les plus chauds, puis les plus récents.
  const RANG: Record<string, number> = { nouveau: 0, en_cours: 1, devis_envoye: 2, gagne: 3, perdu: 4 };
  const ordre = (st: string): number => RANG[st] ?? 5;
  const tries = [...leads].sort((a, b) => ordre(a.statut) - ordre(b.statut) || (b.score ?? 0) - (a.score ?? 0) || Number(b.ts) - Number(a.ts));

  return (
    <div className="space-y-4">
      <div className="aj-lead-hero">
        <h1>🎯 Clients prêts à acheter</h1>
        <p>
          Le bot crée une fiche quand un client montre un <b>vrai intérêt</b> pour une offre.
          Ton job : ouvrir la conversation, conclure, puis passer la fiche en <b>Gagné</b> ou <b>Perdu</b>.
        </p>
      </div>

      <div className="aj-lead-pipe">
        <Link href="/admin/leads" className={filtre === "" ? "is-on" : ""}>
          <b>{tous.length}</b>
          <span>Tous</span>
        </Link>
        {STATUTS.map((valeur) => (
          <Link key={valeur} href={`/admin/leads?statut=${valeur}`} className={`st-${valeur}${filtre === valeur ? " is-on" : ""}`}>
            <b>{compte(valeur)}</b>
            <span>{STATUT_LABEL[valeur]}</span>
          </Link>
        ))}
      </div>

      {tries.length === 0 && (
        <div className="card text-center text-sm text-neutral-400">
          {filtre
            ? `Aucun client au statut « ${STATUT_LABEL[filtre] ?? filtre} ».`
            : "Aucun client pour l'instant — le bot en ajoutera un dès qu'une conversation devient sérieuse."}
        </div>
      )}

      <div className="aj-lead-list">
        {tries.map((lead) => {
          const contact = core.contacts.get(lead.waId);
          const score = Math.max(0, Math.min(5, lead.score ?? 0));
          return (
            <article key={lead.id} className={`card aj-lead st-${lead.statut}`}>
              <div className="aj-lead-top">
                <div className="min-w-0">
                  <p className="aj-lead-name">{contact?.nom || `+${lead.waId}`}</p>
                  <p className="aj-lead-offre">{lead.offre || "Offre à préciser"}</p>
                </div>
                <div className="aj-lead-score" title={`Intérêt : ${score}/5`}>
                  <span>{"🔥".repeat(score) || "—"}</span>
                  <small>{score >= 4 ? "très chaud" : score >= 3 ? "chaud" : "tiède"}</small>
                </div>
              </div>
              {lead.besoin && <p className="aj-lead-besoin">{lead.besoin}</p>}
              {(lead.budget || lead.delai) && (
                <p className="aj-lead-tags">
                  {lead.budget && <span>💶 {lead.budget}</span>}
                  {lead.delai && <span>⏱ {lead.delai}</span>}
                </p>
              )}
              <div className="aj-lead-actions">
                <Link href={`/admin/conversations/${lead.waId}?from=${encodeURIComponent(filtre ? `/admin/leads?statut=${filtre}` : "/admin/leads")}`} className="btn btn-primary">
                  Ouvrir la conversation
                </Link>
                <StatutSelect leadId={lead.id} statut={lead.statut} options={OPTIONS} />
              </div>
              <p className="aj-lead-date">Fiche créée le {new Date(lead.ts).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</p>
            </article>
          );
        })}
      </div>

      <a href="/api/export/leads" className="btn btn-secondary">
        ⬇️ Télécharger la liste (Excel)
      </a>
    </div>
  );
}
