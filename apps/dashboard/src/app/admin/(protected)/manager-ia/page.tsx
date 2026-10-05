import type { EscalationRow, KnowledgeEntry } from "@arbi/core";
import Link from "next/link";
import {
  cancelEscalationAction,
  deleteKnowledgeAction,
  saveManagerSettingsAction,
  updateKnowledgeAction,
} from "@/lib/manager-actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { ChatMedia } from "../conversations/[waId]/chat-media";

export const dynamic = "force-dynamic";

function waitLabel(ts: number, end: number = Date.now()): string {
  const min = Math.max(0, Math.round((end - ts) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h ${min % 60} min` : `${Math.floor(h / 24)} j`;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  en_attente: { label: "🟠 EN ATTENTE DE JACOB", cls: "badge-humain" },
  repondue: { label: "🔵 RÉPONDU — envoi au client en cours", cls: "badge-neutre" },
  resolue: { label: "🟢 TRAITÉ", cls: "badge-bot" },
  erreur: { label: "🔴 ERREUR — réponse non envoyée au client", cls: "badge-humain" },
  annulee: { label: "⚪ ANNULÉ", cls: "badge-neutre" },
};

function Escalation({ e, waiting }: { e: EscalationRow; waiting: boolean }) {
  const { core } = getRuntime();
  const links = core.knowledge.escalations.links(e.id);
  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`badge ${(STATUS[e.statut] ?? STATUS.resolue!).cls}`}>
          {(STATUS[e.statut] ?? STATUS.resolue!).label}
        </span>
        <span className="text-xs text-neutral-500">
          {new Date(e.createdAt).toLocaleString("fr-FR")} · {waiting ? `attente ${waitLabel(e.createdAt)}` : `traité en ${waitLabel(e.createdAt, e.resolvedAt ?? Date.now())}`} · {e.categorie}
        </span>
      </div>
      <p className="text-sm">“{e.question}”</p>
      {e.mediaFile && <ChatMedia file={e.mediaFile} mime={e.mediaMime || "image/jpeg"} alt="Photo du client" />}
      {e.contexte && <p className="whitespace-pre-line rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600">{e.contexte}</p>}
      {e.reponseJacob && <p className="rounded-lg bg-emerald-50 p-2 text-sm">Réponse de Jacob : {e.reponseJacob}</p>}
      <div className="flex flex-wrap gap-2 text-xs">
        {links.map((l) => (
          <Link key={l.id} href={`/admin/conversations/${l.waId}`} className="badge badge-neutre hover:underline">
            +{l.waId} · {l.delivery.replace("_", " ")}
          </Link>
        ))}
      </div>
      {waiting && (
        <form action={cancelEscalationAction.bind(null, e.id)}>
          <button className="btn btn-secondary" type="submit">Annuler la demande</button>
        </form>
      )}
    </div>
  );
}

function Knowledge({ k }: { k: KnowledgeEntry }) {
  const { core } = getRuntime();
  const history = core.knowledge.entries.history(k.id);
  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
        <span className="badge badge-bot">{k.theme || "Général"} · v{k.version}</span>
        <span>
          Appris le {new Date(k.createdAt).toLocaleString("fr-FR")} · source {k.source}
          {k.escalationId ? ` · demande #${k.escalationId}` : ""}
        </span>
      </div>
      {k.questionOrigine && <p className="text-xs text-neutral-500">Question d'origine : “{k.questionOrigine}”</p>}
      {k.reponseJacob && <p className="text-xs text-neutral-500">Réponse brute de Jacob : « {k.reponseJacob} »</p>}
      <form action={updateKnowledgeAction.bind(null, k.id)} className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <div><span className="label">Sujet</span><input name="sujet" defaultValue={k.sujet} className="input" /></div>
          <div><span className="label">Thème</span><input name="theme" defaultValue={k.theme} className="input" /></div>
        </div>
        <div><span className="label">Question type</span><textarea name="intention" defaultValue={k.intention} rows={2} className="input" /></div>
        <div><span className="label">Réponse métier</span><textarea name="reponse" defaultValue={k.reponse} rows={3} className="input" /></div>
        <div><span className="label">Conditions (jamais simplifiées)</span><textarea name="conditions" defaultValue={k.conditions} rows={2} className="input" /></div>
        <div><span className="label">Exceptions</span><textarea name="exceptions" defaultValue={k.exceptions} rows={2} className="input" /></div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" type="submit">💾 Enregistrer</button>
        </div>
      </form>
      <form action={deleteKnowledgeAction.bind(null, k.id)}>
        <button className="btn btn-danger" type="submit">🗑 Supprimer cette connaissance</button>
      </form>
      {history.length > 1 && (
        <details className="text-xs text-neutral-600">
          <summary className="cursor-pointer">Historique ({history.length})</summary>
          <ul className="mt-1 space-y-1">
            {history.map((h) => (
              <li key={h.id}>
                {new Date(h.createdAt).toLocaleString("fr-FR")} · <b>{h.action}</b> · {h.source}
                {h.raison ? ` · ${h.raison}` : ""}
                {h.avant?.reponse && h.apres?.reponse && h.avant.reponse !== h.apres.reponse
                  ? ` — « ${h.avant.reponse} » → « ${h.apres.reponse} »`
                  : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default async function ManagerIaPage({ searchParams }: { searchParams: Promise<{ q?: string; vue?: string }> }) {
  await requireSession();
  const { q = "", vue = "connaissances" } = await searchParams;
  const { core } = getRuntime();
  const waiting = core.knowledge.escalations.open();
  const resolved = core.knowledge.escalations.closed(30);
  const entries = core.knowledge.entries.list({ q, statut: vue === "remplacees" ? "remplace" : "actif", limit: 100 });
  const haut = Math.round(Number(core.settings.get("confiance_seuil_haut")) * 100);
  const bas = Math.round(Number(core.settings.get("confiance_seuil_bas")) * 100);
  const actif = core.settings.get("manager_ia_actif");

  const tab = (id: string, label: string) => (
    <Link href={`/admin/manager-ia?vue=${id}`} className={`btn ${vue === id ? "btn-primary" : "btn-secondary"}`}>{label}</Link>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">🧠 Apprentissage IA</h1>
        <p className="text-sm text-neutral-500">
          Client → Manager IA → Jacob seulement si nécessaire. Ce que Jacob t'apprend est retenu pour les prochains clients.
        </p>
      </div>

      <form action={saveManagerSettingsAction} className="card space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="manager_ia_actif" defaultChecked={actif} /> Manager IA actif (le bot demande à Jacob quand il ne sait pas)
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <div><span className="label">Seuil haut — réponse automatique (≥ %)</span><input name="seuil_haut" type="number" min={30} max={95} defaultValue={haut} className="input" /></div>
          <div><span className="label">Seuil bas — en dessous, demander à Jacob (%)</span><input name="seuil_bas" type="number" min={10} max={90} defaultValue={bas} className="input" /></div>
        </div>
        <p className="text-xs text-neutral-500">Entre les deux seuils, le bot cherche davantage dans la base et le contexte avant de solliciter Jacob.</p>
        <button className="btn btn-primary" type="submit">Enregistrer</button>
      </form>

      <div className="flex flex-wrap gap-2">
        {tab("connaissances", `Connaissances (${core.knowledge.entries.count()})`)}
        {tab("attente", `🟠 En attente (${waiting.length})`)}
        {tab("resolues", "🟢 Traitées")}
        {tab("remplacees", "Remplacées / conflits")}
      </div>

      {(vue === "connaissances" || vue === "remplacees") && (
        <>
          <form className="flex gap-2" action="/admin/manager-ia">
            <input type="hidden" name="vue" value={vue} />
            <input name="q" defaultValue={q} placeholder="Rechercher une connaissance…" className="input" />
            <button className="btn btn-secondary" type="submit">🔎</button>
          </form>
          {entries.length === 0 && <div className="card text-sm text-neutral-500">Rien pour l'instant.</div>}
          {entries.map((k) => <Knowledge key={k.id} k={k} />)}
        </>
      )}
      {vue === "attente" && (waiting.length === 0 ? <div className="card text-sm text-neutral-500">Aucune question en attente de Jacob.</div> : waiting.map((e) => <Escalation key={e.id} e={e} waiting />))}
      {vue === "resolues" && (resolved.length === 0 ? <div className="card text-sm text-neutral-500">Aucune demande traitée.</div> : resolved.map((e) => <Escalation key={e.id} e={e} waiting={false} />))}
    </div>
  );
}
