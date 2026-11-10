import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { jacobHistory, jacobPending, waitingLabel, type JacobItem } from "@/lib/jacob";
import { markAlertTreatedAction } from "@/lib/actions";
import { cancelEscalationAction } from "@/lib/manager-actions";
import { Icon, idx } from "../icons";
import { JacobPhoto } from "./jacob-photo";

export const dynamic = "force-dynamic";

function Request({ r, i }: { r: JacobItem; i: number }) {
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
      {r.mediaFile && <JacobPhoto file={r.mediaFile} nom={r.nom} />}
      {r.reponse && <p className="aj-req-answer">Réponse de Jacob : {r.reponse}</p>}
      <footer className="aj-req-actions">
        <span className="aj-req-kind">{r.kind === "question" ? "Question inconnue du bot" : "Alerte"}</span>
        <span className="flex-1" />
        <Link href={`/admin/conversations/${r.waId}`} className="btn btn-secondary">
          Voir la conversation
        </Link>
        {!r.resolu && r.kind === "alerte" && (
          <form action={markAlertTreatedAction.bind(null, r.id, r.waId)}>
            <button type="submit" className="btn btn-primary">
              Traité — le bot reprend
            </button>
          </form>
        )}
        {!r.resolu && r.kind === "question" && (
          <form action={cancelEscalationAction.bind(null, r.id)}>
            <button type="submit" className="btn btn-secondary">
              Classer sans suite
            </button>
          </form>
        )}
      </footer>
    </article>
  );
}

export default async function JacobPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  await requireSession();
  const { vue = "attente" } = await searchParams;
  const { core } = getRuntime();
  const pending = jacobPending(core);
  const history = vue === "historique" ? jacobHistory(core, 40) : [];

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

      <div className="aj-jtabs" role="tablist">
        <Link href="/admin/jacob" className={`aj-jtab ${vue !== "historique" ? "is-on" : ""}`} role="tab">
          En attente <b>{pending.length}</b>
        </Link>
        <Link href="/admin/jacob?vue=historique" className={`aj-jtab ${vue === "historique" ? "is-on" : ""}`} role="tab">
          Historique
        </Link>
      </div>

      {vue !== "historique" ? (
        pending.length === 0 ? (
          <div className="aj-empty">Rien en attente : Jacob est à jour.</div>
        ) : (
          <div className="aj-reqlist">
            {pending.map((r, i) => (
              <Request key={r.key} r={r} i={i} />
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
