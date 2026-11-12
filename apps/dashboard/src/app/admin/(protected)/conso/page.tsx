import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { suiviConso } from "@/lib/api-balance";
import { saisirSoldeAction } from "@/lib/api-balance-actions";

export const dynamic = "force-dynamic";

const usd = (n: number): string => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })} $`;

export default async function ConsoPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requireSession();
  const { msg } = await searchParams;
  const s = suiviConso(getRuntime().core);
  const bas = s.restantUsd !== null && s.restantUsd < 3;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Consommation Kimi</h1>
        <p className="text-sm text-neutral-500">
          Estimation à partir des réponses réellement envoyées par le bot. Le solde exact reste celui affiché sur la console Kimi.
        </p>
      </div>
      {msg && <div className="card text-sm font-medium">{msg}</div>}

      {s.saisie ? (
        <div className="card space-y-2" style={bas ? { borderColor: "#f0142f" } : undefined}>
          <p className="text-sm text-neutral-500">Solde restant estimé</p>
          <p className="text-3xl font-bold">{usd(Math.max(0, s.restantUsd ?? 0))}</p>
          {bas && <p className="text-sm font-semibold" style={{ color: "#f0142f" }}>⚠️ Solde bas : pense à recharger le compte Kimi.</p>}
          <p className="text-sm">
            Saisi : <b>{usd(s.saisie.soldeUsd)}</b> le{" "}
            {new Date(s.saisie.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}
            {" "}· consommé depuis : <b>{usd(s.depuisSaisie.usd)}</b> ({s.depuisSaisie.appels} appel(s) à l&apos;IA)
          </p>
          <p className="text-sm">
            Moyenne : <b>{usd(s.moyenneJourUsd)}</b> / jour (7 derniers jours)
            {s.joursRestants !== null && (
              <>
                {" "}· il reste environ <b>{Math.floor(s.joursRestants)} jour(s)</b>
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="card text-sm">Aucun solde saisi pour l&apos;instant. Entre ci-dessous le solde affiché sur Kimi.</div>
      )}

      <div className="card">
        <h2 className="font-semibold mb-2">Par jour</h2>
        <table className="w-full text-sm">
          <tbody>
            {s.jours.map((j, i) => (
              <tr key={j.jour} className="border-t border-neutral-800">
                <td className="py-1">{i === 0 ? "Aujourd'hui" : j.jour}</td>
                <td className="py-1 text-right">{j.appels} appel(s)</td>
                <td className="py-1 text-right font-semibold">{usd(j.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={saisirSoldeAction} className="card space-y-3">
        <h2 className="font-semibold">Mettre à jour le solde</h2>
        <p className="text-sm text-neutral-500">
          Après chaque recharge (ou pour recaler), recopie le solde exact affiché sur Kimi. Le suivi repart de ce moment-là.
        </p>
        <label className="block text-sm">
          Solde Kimi actuel ($)
          <input name="solde" inputMode="decimal" required placeholder="21,12" className="input w-full" />
        </label>
        <details className="text-sm">
          <summary>Tarifs utilisés (kimi-k2.6)</summary>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <label>
              Entrée ($ / million)
              <input name="prix_entree" inputMode="decimal" defaultValue={String(s.prix.entree)} className="input w-full" />
            </label>
            <label>
              Sortie ($ / million)
              <input name="prix_sortie" inputMode="decimal" defaultValue={String(s.prix.sortie)} className="input w-full" />
            </label>
          </div>
        </details>
        <button type="submit" className="btn btn-primary">
          Enregistrer le solde
        </button>
      </form>
    </div>
  );
}
