import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { jacobHistory, jacobPending, waitingLabel, type JacobItem } from "@/lib/jacob";
import { InstantForm } from "../instant-form";
import { clearFalseAlertsAction, jacobReplyAction, markClientTreatedAction } from "@/lib/actions";
import { auditOpenAlerts, OUTBOUND_MEDIA_ACCEPT } from "@arbi/core";
import { ScrollMemory } from "../back-nav";
import { FilePicker, SendButton } from "../file-picker";
import { Icon, idx } from "../icons";
import { JacobPhoto } from "./jacob-photo";

export const dynamic = "force-dynamic";

function Request({ r, i, draft = "" }: { r: JacobItem; i: number; draft?: string }) {
  return (
    <article className={`aj-req aj-rise ${r.resolu ? "is-done" : "is-live"}`} style={idx(Math.min(i, 8))}>
      <header className="aj-req-head">
        <span className="aj-avatar">{r.nom.replace(/^\+/, "")[0]?.toUpperCase() ?? "?"}</span>
        <span className="min-w-0 flex-1">
          <span className="aj-conv-name block">{r.nom}</span>
          <span className="aj-req-when block">
            {new Date(r.quand).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
            {!r.resolu && ` · attend depuis ${waitingLabel(r.quand)}`}
          </span>
        </span>
        <span className={`aj-status ${r.resolu ? "is-ok" : "is-wait"}`}>{r.statutLabel}</span>
      </header>
      <p className="aj-req-q">“{r.question}”</p>
      {r.contexte && <p className="aj-req-ctx">{r.contexte}</p>}
      {r.rdv && !r.resolu && (
        <Link href="/admin/rendez-vous" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
          📞 Approuver ou refuser le rendez-vous
        </Link>
      )}
      {r.mediaFile && <JacobPhoto file={r.mediaFile} nom={r.nom} />}
      {r.reponse && <p className="aj-req-answer">Réponse de Jacob : {r.reponse}</p>}
      <footer className="aj-req-actions">
        <span className="aj-req-kind">{r.kind === "question" ? "Question inconnue du bot" : "Alerte"}</span>
        <span className="flex-1" />
        <Link href={`/admin/conversations/${r.waId}?from=${encodeURIComponent(r.resolu ? "/admin/jacob?vue=historique" : "/admin/jacob")}`} className="btn btn-secondary">
          Voir la conversation
        </Link>
        {!r.resolu && (
          <InstantForm action={markClientTreatedAction.bind(null, r.waId)} className="btn btn-primary" doneLabel="✅ Traité" hideClosest="article">
            ✅ Marquer traité
          </InstantForm>
        )}
      </footer>
      {!r.resolu && (
        <form action={jacobReplyAction.bind(null, r.waId)} className="aj-req-reply">
          <textarea
            name="message"
            rows={2}
            className="input"
            placeholder={`Répondre à ${r.nom}…`}
            aria-label={`Réponse à ${r.nom}`}
            defaultValue={draft}
          />
          <SendButton>Envoyer</SendButton>
          <div className="aj-req-files">
            <FilePicker accept={OUTBOUND_MEDIA_ACCEPT} required={false} label="📎 Joindre photo / vidéo / PDF / Word / Excel…" />
          </div>
          <span className="aj-req-hint">Texte, pièce jointe, ou les deux. À l&apos;envoi : demande traitée et main rendue au bot.</span>
        </form>
      )}
    </article>
  );
}

export default async function JacobPage({ searchParams }: { searchParams: Promise<{ vue?: string; msg?: string; client?: string; draft?: string }> }) {
  await requireSession();
  const { vue = "attente", msg = "", client = "", draft = "" } = await searchParams;
  const { core } = getRuntime();
  const pending = jacobPending(core);
  const history = vue === "historique" ? jacobHistory(core, 40) : [];
  // Audit : alertes ouvertes qui ne demandent aucune intervention de Jacob (rien n'est retiré sans clic).
  const audit = vue !== "historique" ? auditOpenAlerts(core) : [];
  const removable = audit.filter((a) => a.verdict !== "a_garder");

  return (
    <div className="aj-page">
      <div className="aj-page-head">
        <h1>
          <Icon name="headset" size={26} /> Demandes en attente de Jacob
        </h1>
        <p>
          Toutes les questions que le bot ne sait pas traiter. Jacob répond sur WhatsApp à la demande reçue : le bot comprend sa réponse,
          prévient le client et retient l&apos;information pour les prochains.
        </p>
      </div>

      <ScrollMemory id={`/admin/jacob?vue=${vue}`} />
      {msg && <div className="card text-sm font-medium">{msg}</div>}

      <div className="aj-jtabs" role="tablist">
        <Link href="/admin/jacob" className={`aj-jtab ${vue !== "historique" ? "is-on" : ""}`} role="tab">
          En attente <b>{pending.length}</b>
        </Link>
        <Link href="/admin/jacob?vue=historique" className={`aj-jtab ${vue === "historique" ? "is-on" : ""}`} role="tab">
          Historique
        </Link>
      </div>

      {removable.length > 0 && (
        <details className="card text-sm" open>
          <summary className="cursor-pointer font-semibold">
            🧹 {removable.length} alerte(s) semblent injustifiées — vérifier et nettoyer
          </summary>
          <ul className="mt-2 space-y-1 text-neutral-600">
            {removable.map((a) => (
              <li key={a.id}>
                <Link href={`/admin/conversations/${a.waId}?from=${encodeURIComponent("/admin/jacob")}`} className="underline">
                  +{a.waId}
                </Link>{" "}
                — {a.raison}
              </li>
            ))}
          </ul>
          <form action={clearFalseAlertsAction} className="mt-3">
            <button type="submit" className="btn btn-primary">
              Retirer ces {removable.length} alerte(s)
            </button>
            <span className="ml-2 text-xs text-neutral-500">L&apos;historique est conservé, aucun message n&apos;est envoyé aux clients.</span>
          </form>
        </details>
      )}

      {vue !== "historique" ? (
        pending.length === 0 ? (
          <div className="aj-empty">Rien en attente : Jacob est à jour.</div>
        ) : (
          <div className="aj-reqlist">
            {pending.map((r, i) => (
              <Request key={r.key} r={r} i={i} draft={r.waId === client ? draft : ""} />
            ))}
          </div>
        )
      ) : history.length === 0 ? (
        <div className="aj-empty">Aucune demande résolue pour le moment.</div>
      ) : (
        <div className="aj-reqlist">
          {history.map((r, i) => (
            <Request key={r.key} r={r} i={i} />
          ))}
        </div>
      )}
    </div>
  );
}
