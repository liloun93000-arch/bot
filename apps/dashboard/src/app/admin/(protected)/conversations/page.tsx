import Link from "next/link";
import { ScrollMemory } from "../back-nav";
import { cookies } from "next/headers";
import { filterConversationsAction } from "@/lib/actions";
import { CONV_FILTER_COOKIE } from "@/lib/constants";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";

export const dynamic = "force-dynamic";

/** Dernier filtre mémorisé, ou `null` si aucun / illisible. */
async function readConvFilter(): Promise<{ q: string; statut: string } | null> {
  const raw = (await cookies()).get(CONV_FILTER_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { q?: unknown; statut?: unknown };
    return {
      q: typeof parsed.q === "string" ? parsed.q : "",
      statut: typeof parsed.statut === "string" ? parsed.statut : "",
    };
  } catch {
    return null;
  }
}

function statusBadge(row: { modeHumain: number; alertesOuvertes: number; optOut: number; statut: string }) {
  if (row.alertesOuvertes > 0) return <span className="badge badge-alerte">alerte</span>;
  if (row.optOut) return <span className="badge badge-neutre">opt-out</span>;
  if (row.modeHumain) return <span className="badge badge-humain">humain</span>;
  if (row.statut === "cloturee") return <span className="badge badge-neutre">clôturée</span>;
  return <span className="badge badge-bot">bot</span>;
}

/** Couleur de la conversation (bande à gauche) : rouge = alerte, orange = Jacob a la main, vert = bot. */
function convKind(row: { modeHumain: number; alertesOuvertes: number; optOut: number; statut: string }): string {
  // Une alerte en cours passe AVANT tout le reste : trait rouge, toujours.
  if (row.alertesOuvertes > 0) return "alerte";
  if (row.optOut || row.statut === "cloturee") return "off";
  if (row.modeHumain) return "humain";
  return "bot";
}

/** Couleur d'avatar stable par client : chaque conversation se reconnaît d'un coup d'œil. */
function avatarColor(waId: string): string {
  let h = 0;
  for (const c of waId) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 38%)`;
}

function initial(label: string): string {
  return (label.replace(/^\+/, "").trim()[0] ?? "?").toUpperCase();
}

function when(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return d.toLocaleString("fr-FR", sameDay
    ? { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }
    : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  // Contexte à retrouver au retour d'une conversation (filtre + recherche).
  const fromHere = `/admin/conversations${new URLSearchParams(
    Object.entries({ q: params.q ?? "", statut: params.statut ?? "" }).filter(([, v]) => v),
  ).toString().replace(/^(?=.)/, "?")}`;
  // Aucun paramètre dans l'URL = on revient sur la liste (lien « ← Conversations »,
  // menu, retour navigateur) : on restaure le dernier filtre utilisé. Un
  // paramètre présent, même vide, reste prioritaire — c'est un choix explicite.
  const memorise =
    params.q === undefined && params.statut === undefined ? await readConvFilter() : null;
  const q = params.q ?? memorise?.q ?? "";
  const statut = params.statut ?? memorise?.statut ?? "";
  const { core } = getRuntime();

  let rows = core.conversationOverview();
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.waId.includes(needle) ||
        (r.nom ?? "").toLowerCase().includes(needle) ||
        r.dernierMessage.toLowerCase().includes(needle),
    );
  }
  if (statut === "alerte") rows = rows.filter((r) => r.alertesOuvertes > 0);
  if (statut === "humain") rows = rows.filter((r) => r.modeHumain === 1);
  if (statut === "bot") rows = rows.filter((r) => r.modeHumain === 0 && r.alertesOuvertes === 0);
  if (statut === "repondre") rows = rows.filter((r) => r.dernierRole === "user" && !r.optOut);
  const all = core.conversationOverview();
  const nbAlerte = all.filter((r) => r.alertesOuvertes > 0).length;
  const nbHumain = all.filter((r) => r.modeHumain === 1 && r.alertesOuvertes === 0).length;
  const nbClient = all.filter((r) => r.dernierRole === "user" && !r.optOut).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Conversations</h1>
        {/* Deux formulaires frères : un <form> ne peut pas en contenir un autre. */}
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex flex-wrap gap-2" action={filterConversationsAction}>
            <input
              name="q"
              defaultValue={q}
              placeholder="Rechercher contact ou message…"
              className="input w-full sm:w-64"
            />
            <select name="statut" defaultValue={statut} className="input w-full sm:w-44">
              <option value="">Tous</option>
              <option value="alerte">Alerte</option>
              <option value="humain">Humain</option>
              <option value="bot">Bot</option>
              <option value="repondre">Client en dernier</option>
            </select>
            <button className="btn btn-secondary" type="submit">
              Filtrer
            </button>
          </form>
          {(q || statut) && (
            // Soumis vide : efface aussi le filtre mémorisé, sinon il
            // reviendrait au prochain retour sur la liste.
            <form action={filterConversationsAction}>
              <button className="btn btn-secondary" type="submit">
                ✕ Tout afficher
              </button>
            </form>
          )}
        </div>
      </div>

      {/*
        Remplace le <table> par une liste de <Link> en grid : chaque ligne est
        entièrement cliquable (un <a> ne peut pas envelopper un <tr>), sans
        aucun JavaScript. L'apparence tableau est conservée par les mêmes
        proportions de colonnes sur l'en-tête et les lignes.
      */}
      <ScrollMemory id={fromHere} />
      <div className="aj-cv-legend">
        <Link href="/admin/conversations?statut=" className="aj-cv-chip">Toutes <b>{all.length}</b></Link>
        <Link href="/admin/conversations?statut=alerte" className="aj-cv-chip is-alerte">Alerte <b>{nbAlerte}</b></Link>
        <Link href="/admin/conversations?statut=humain" className="aj-cv-chip is-humain">Jacob a la main <b>{nbHumain}</b></Link>
        <Link href="/admin/conversations?statut=repondre" className="aj-cv-chip is-unread">Client en dernier <b>{nbClient}</b></Link>
      </div>

      <div className="aj-cv-list" role="list">
        {rows.map((row) => {
          const label = row.nom || `+${row.waId}`;
          const kind = convKind(row);
          const aRepondre = row.dernierRole === "user" && !row.optOut;
          return (
            <Link
              key={row.waId}
              role="listitem"
              href={`/admin/conversations/${row.waId}?from=${encodeURIComponent(fromHere)}`}
              aria-label={`Ouvrir la conversation avec ${label}`}
              className={`aj-cv is-${kind}${aRepondre ? " is-unread" : ""}`}
            >
              <span className="aj-cv-avatar" style={{ background: avatarColor(row.waId) }} aria-hidden>
                {initial(label)}
              </span>
              <span className="aj-cv-body">
                <span className="aj-cv-top">
                  <span className="aj-cv-name">{label}</span>
                  <span className="aj-cv-time">{when(row.dernierTs)}</span>
                </span>
                <span className="aj-cv-phone">
                  {[row.nom ? `+${row.waId}` : "", row.serviceEnCours ?? ""].filter(Boolean).join(" · ") || "Nouveau contact"}
                </span>
                <span className="aj-cv-last">
                  <b>{row.dernierRole === "user" ? "Client : " : "Bot / Jacob : "}</b>
                  {row.dernierMessage || "—"}
                </span>
                <span className="aj-cv-tags">
                  {statusBadge(row)}
                  {aRepondre && <span className="aj-cv-flag">● Dernier message du client</span>}
                  {row.score != null && <span className="aj-cv-score">Score {row.score}</span>}
                </span>
              </span>
            </Link>
          );
        })}
        {rows.length === 0 && <div className="aj-empty">Aucune conversation.</div>}
      </div>
    </div>
  );
}
