import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { jacobPendingCount } from "@/lib/jacob";
import { parsePeriod, previousPeriod } from "@/lib/period";
import { visitStats } from "@/lib/visits";
import { VisitChart } from "./visit-chart";
import { clicksBySource, listSources } from "@/lib/tracking";
import { PeriodFilter } from "./period-filter";
import { clientPhotos, homeStats, recentConversations, themeCounts, type Delta } from "@/lib/home";
import { computeKpis, topQuestions } from "@/lib/stats";
import { CountUp, PhotoGallery } from "./home-client";
import { Icon, idx, type IconName } from "./icons";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

/** Icône d'un thème d'après son nom (repli : étiquette). */
function themeIcon(nom: string): IconName {
  const n = nom.toLowerCase();
  if (/fournisseur|livraison|stock|commande/.test(n)) return "box";
  if (/formation|cours|apprendre|inscription/.test(n)) return "cap";
  if (/paiement|prix|tarif|devis|factur/.test(n)) return "card";
  if (/produit|catalogue|offre|service/.test(n)) return "tag";
  return "layers";
}

function DeltaBadge({ delta }: { delta: Delta }) {
  if (delta.pct === null) return <span className="aj-delta">↑ nouveau</span>;
  if (delta.pct > 0) return <span className="aj-delta">↑ +{delta.pct}%</span>;
  if (delta.pct < 0) return <span className="aj-delta is-down">↓ {delta.pct}%</span>;
  return <span className="aj-delta is-flat">= 0%</span>;
}

function Stat({
  href,
  icon,
  label,
  value,
  hot,
  index,
  children,
}: {
  href: string;
  icon: IconName;
  label: React.ReactNode;
  value: number;
  hot?: boolean;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`aj-stat aj-rise ${hot ? "is-hot" : ""}`} style={idx(index)}>
      <span className="aj-stat-ico">
        <Icon name={icon} size={26} />
      </span>
      <span className="aj-stat-top">
        <span className="aj-stat-label">{label}</span>
        <span className="aj-stat-num">
          <CountUp value={value} />
        </span>
      </span>
      {children}
    </Link>
  );
}

function KpiRow({ label, values }: { label: string; values: Array<number | string> }) {
  return (
    <tr className="border-t border-neutral-100">
      <td className="py-2 pr-4 text-sm text-neutral-600">{label}</td>
      {values.map((value, i) => (
        <td key={i} className="py-2 pr-4 text-right text-sm font-semibold">
          {value}
        </td>
      ))}
    </tr>
  );
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; du?: string; au?: string }>;
}) {
  await requireSession();
  const { core } = getRuntime();

  // ── Accueil (présentation mobile) ──
  const stats = homeStats(core);
  // Un seul compteur « Jacob » partout (questions inconnues + alertes) : même nombre que le badge.
  const enAttenteJacob = jacobPendingCount(core);
  const alertesOuvertes = enAttenteJacob;
  const nbConnaissances = core.knowledge.entries.count();
  const recentes = recentConversations(core, 3);
  const themes = themeCounts(core, 4);
  const photos = clientPhotos(core, 8);

  // ── Statistiques détaillées (inchangées) ──
  const [day, week, month] = [computeKpis(core, DAY), computeKpis(core, 7 * DAY), computeKpis(core, 30 * DAY)];
  const openAlerts = core.alerts.open();
  const nouveauxLeads = core.leads.countNouveaux();
  const top = topQuestions(core, 10);
  const unanswered = core.questions.unanswered(10);
  // ── Période choisie (catégories + origine des contacts) ──
  const period = parsePeriod(await searchParams);
  const visites = visitStats(getRuntime().core, period.from, period.to + 1);
  const prev = previousPeriod(period);
  const parCategorie = core.sqlite
    .prepare(
      `SELECT categorie, COUNT(*) AS n FROM questions WHERE created_at >= ? AND created_at < ? GROUP BY categorie ORDER BY n DESC`,
    )
    .all(period.from, period.to) as Array<{ categorie: string; n: number }>;
  const maxCat = Math.max(1, ...parCategorie.map((c) => c.n));
  const sources = listSources(core);
  const clicks = clicksBySource(core, period.from, period.to);
  const clicksPrev = clicksBySource(core, prev.from, prev.to);
  const totalClics = [...clicks.values()].reduce((a, b) => a + b, 0);
  const nouveauxContacts = (
    core.sqlite.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE created_at >= ? AND created_at < ?`).get(period.from, period.to) as { n: number }
  ).n;

  return (
    <div className="aj-home">
      {/* ───── Hero ───── */}
      {/* Bannière d'accueil fournie par Jacob (image complète, à l'échelle de l'écran). */}
      <section className="aj-banner aj-rise">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/banniere-accueil.webp"
          alt="Dashboard Bot ARBI Jacob — Gestion et suivi de votre bot WhatsApp"
          width={1735}
          height={776}
        />
      </section>

      {/* ───── 4 chiffres clés (2 × 2 sur mobile) ───── */}
      <div className="aj-stats" style={{ marginTop: 12 }}>
        <Stat
          href="/admin/conversations"
          icon="chat"
          label={
            <>
              Conversations
              <br />
              actives
            </>
          }
          value={stats.conversationsActives.value}
          index={1}
        >
          <DeltaBadge delta={stats.conversationsActives.delta} />
        </Stat>
        <Stat
          href="/admin/jacob"
          icon="user-clock"
          label={
            <>
              En attente
              <br />
              Jacob
            </>
          }
          value={enAttenteJacob}
          hot={enAttenteJacob > 0}
          index={2}
        >
          <span className={`aj-delta ${enAttenteJacob > 0 ? "is-down" : ""}`}>
            {enAttenteJacob > 0 ? "à traiter" : "à jour"}
          </span>
        </Stat>
        <div className="aj-stat aj-rise is-know" style={idx(3)}>
          <Link href="/admin/manager-ia" className="aj-stat-main" aria-label="Voir les connaissances">
            <span className="aj-stat-ico">
              <Icon name="brain" size={26} />
            </span>
            <span className="aj-stat-top">
              <span className="aj-stat-label">Connaissances</span>
              <span className="aj-stat-num">
                <CountUp value={nbConnaissances} />
              </span>
            </span>
          </Link>
          <Link href="/admin/manager-ia?ajout=ouvrir#ajout" className="aj-stat-plus" aria-label="Ajouter une connaissance" title="Ajouter une connaissance">
            +
          </Link>
        </div>
        <Stat
          href="/admin/medias"
          icon="image"
          label={
            <>
              Photos
              <br />
              reçues
            </>
          }
          value={stats.photos.value}
          index={4}
        >
          <DeltaBadge delta={stats.photos.delta} />
        </Stat>
      </div>
      <p className="aj-wide" style={{ margin: "6px 2px 0", fontSize: "0.7rem", color: "var(--aj-gray)" }}>
        Chiffres sur 7 jours glissants, comparés aux 7 jours précédents.
      </p>

      {/* ───── Colonne gauche : conversations + validation ───── */}
      <div>
        <section className="aj-section">
          <div className="aj-section-head">
            <h2>
              <Icon name="chat" size={22} /> Conversations récentes
            </h2>
            <Link href="/admin/conversations" className="aj-link">
              Voir tout <Icon name="chevron" size={16} />
            </Link>
          </div>
          {recentes.length === 0 ? (
            <div className="aj-empty">Aucune conversation pour le moment.</div>
          ) : (
            <div className="aj-convlist">
              {recentes.map((c, i) => (
                <Link
                  key={c.waId}
                  href={`/admin/conversations/${c.waId}`}
                  className={`aj-conv aj-rise ${c.chaude ? "is-hot" : ""}`}
                  style={idx(i + 5)}
                >
                  <span className="aj-avatar">{c.initiale}</span>
                  <span className="aj-conv-main">
                    <span className="aj-conv-name block">{c.nom}</span>
                    <span className="aj-conv-msg block">{c.extrait}</span>
                    {c.photos > 0 && (
                      <span className="aj-conv-media">
                        <Icon name="image" size={14} /> {c.photos} photo{c.photos > 1 ? "s" : ""}
                      </span>
                    )}
                  </span>
                  <span className="aj-conv-side">
                    <span>{c.heure}</span>
                    {c.nonLus > 0 ? <span className="aj-unread">{c.nonLus}</span> : <span />}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <Link
          href="/admin/jacob"
          className={`aj-validate aj-rise ${alertesOuvertes > 0 ? "is-live" : ""}`}
          style={idx(8)}
        >
          <span className="aj-validate-ico">
            <Icon name="headset" size={34} />
          </span>
          <span className="min-w-0">
            <span className="aj-validate-title block">Validation Jacob requise</span>
            <span className="aj-validate-sub block">Demandes que le bot ne peut pas traiter seul</span>
          </span>
          <span className="aj-validate-count">{alertesOuvertes}</span>
          <Icon name="chevron" size={22} />
        </Link>
      </div>

      {/* ───── Colonne droite : thèmes + photos ───── */}
      <div>
        <section className="aj-section">
          <div className="aj-section-head">
            <h2>
              <Icon name="layers" size={22} /> Catégories / Thèmes
            </h2>
            <Link href="/admin/questions?onglet=sujets" className="aj-link">
              Gérer <Icon name="chevron" size={16} />
            </Link>
          </div>
          {themes.length === 0 ? (
            <div className="aj-empty">Les thèmes apparaîtront dès les premières questions clients.</div>
          ) : (
            <div className="aj-themes">
              {themes.map((t, i) => (
                <Link
                  key={t.nom}
                  href="/admin/questions?onglet=sujets"
                  className="aj-theme aj-rise"
                  style={idx(i + 9)}
                  title={`${t.clients} client${t.clients > 1 ? "s" : ""}`}
                >
                  <Icon name={themeIcon(t.nom)} size={28} />
                  <span className="aj-theme-name">{t.nom}</span>
                  <span className="aj-theme-n">{t.clients}</span>
                </Link>
              ))}
            </div>
          )}
          <p style={{ margin: "6px 2px 0", fontSize: "0.7rem", color: "var(--aj-gray)" }}>
            Nombre de clients classés dans chaque thème.
          </p>
        </section>

        <section className="aj-section">
          <div className="aj-section-head">
            <h2>
              <Icon name="image" size={22} /> Photos clients <span style={{ fontWeight: 400 }}>(récentes)</span>
            </h2>
            <Link href="/admin/medias" className="aj-link">
              Voir tout <Icon name="chevron" size={16} />
            </Link>
          </div>
          {photos.length === 0 ? (
            <div className="aj-empty">Aucune photo reçue pour le moment.</div>
          ) : (
            <PhotoGallery photos={photos} variant="strip" />
          )}
        </section>
      </div>

      {/* ───── Statistiques détaillées (contenu historique, conservé) ───── */}
      <div className="aj-wide space-y-4" style={{ marginTop: 28 }}>
        <div className="aj-section-head" style={{ marginBottom: 0 }}>
          <h2>
            <Icon name="chart" size={22} /> Statistiques détaillées
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="card">
            <div className="label">Alertes ouvertes</div>
            <div className={`text-3xl font-bold ${openAlerts.length > 0 ? "text-red-600" : ""}`}>
              {openAlerts.length}
            </div>
            {openAlerts.length > 0 && (
              <Link href="/admin/jacob" className="text-sm text-red-600 underline">
                Voir les conversations en alerte →
              </Link>
            )}
          </div>
          <div className="card">
            <div className="label">Demandes à traiter</div>
            <div className={`text-3xl font-bold ${nouveauxLeads > 0 ? "text-amber-600" : ""}`}>
              {nouveauxLeads}
            </div>
            {nouveauxLeads > 0 ? (
              <Link href="/admin/leads?statut=nouveau" className="text-sm text-amber-700 underline">
                Voir les demandes →
              </Link>
            ) : (
              <div className="text-xs text-neutral-500">Tout est traité.</div>
            )}
          </div>
          <div className="card">
            <div className="label">Conversations (7 j)</div>
            <div className="text-3xl font-bold">{week.conversations}</div>
          </div>
          <div className="card">
            <div className="label">Questions traitées seul (7 j)</div>
            <div className="text-3xl font-bold">
              {week.tauxResolution === null ? "—" : `${week.tauxResolution} %`}
            </div>
            <div className="text-xs text-neutral-500">
              {week.questionsAutonomes} par le bot · {week.questionsJacob} avec Jacob
            </div>
          </div>
        </div>

        <div className="card overflow-x-auto">
          <h2 className="mb-2 font-semibold">KPI</h2>
          <table className="w-full min-w-105">
            <thead>
              <tr className="text-right text-xs uppercase text-neutral-400">
                <th className="text-left font-medium">Indicateur</th>
                <th className="pr-4 font-medium">Aujourd&apos;hui</th>
                <th className="pr-4 font-medium">7 jours</th>
                <th className="pr-4 font-medium">30 jours</th>
              </tr>
            </thead>
            <tbody>
              <KpiRow label="Conversations" values={[day.conversations, week.conversations, month.conversations]} />
              <KpiRow
                label="Nouveaux contacts"
                values={[day.nouveauxContacts, week.nouveauxContacts, month.nouveauxContacts]}
              />
              <KpiRow
                label="Questions traitées par le bot seul"
                values={[day, week, month].map((p) =>
                  p.tauxResolution === null ? "—" : `${p.tauxResolution} %`,
                )}
              />
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card" id="periode">
            <h2 className="mb-2 font-semibold">Demandes par catégorie</h2>
            <PeriodFilter period={period} />
            {parCategorie.length === 0 && (
              <p className="mt-3 text-sm text-neutral-500">Aucune demande sur cette période.</p>
            )}
            <div className="mt-3 space-y-2">
              {parCategorie.map((c) => (
                <div key={c.categorie} className="flex items-center gap-2">
                  <span className="w-36 shrink-0 text-sm">{c.categorie}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-neutral-100">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${(c.n / maxCat) * 100}%`,
                        background: "linear-gradient(90deg, #b3121f, #ff2d3d)",
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm font-semibold">{c.n}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="mb-2 font-semibold">Origine des contacts — clics par source</h2>
            <PeriodFilter period={period} />
            <div className="mt-3 space-y-2">
              {sources.map((src) => {
                const n = clicks.get(src.id) ?? 0;
                const before = clicksPrev.get(src.id) ?? 0;
                const pct = totalClics ? Math.round((n / totalClics) * 100) : 0;
                const evo = before ? Math.round(((n - before) / before) * 100) : null;
                return (
                  <div key={src.id} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-sm">{src.nom}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-neutral-100">
                      <div className="h-full rounded" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #b3121f, #ff2d3d)" }} />
                    </div>
                    <span className="w-24 text-right text-sm">
                      <b>{n}</b> · {pct} %
                      {evo !== null && <span className={evo >= 0 ? "text-green-500" : "text-red-500"}> {evo >= 0 ? "▲" : "▼"}{Math.abs(evo)} %</span>}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              {totalClics} clic(s) sur les liens de suivi · {nouveauxContacts} nouveau(x) contact(s) WhatsApp sur la période, toutes
              origines confondues. Les clics ne sont pas des contacts : WhatsApp ne permet pas de savoir de façon fiable d&apos;où
              vient chaque client, donc aucune source n&apos;est attribuée individuellement.{" "}
              <Link href="/admin/sources" className="underline">
                Gérer les liens
              </Link>
            </p>
          </div>

          <div className="card">
            <h2 className="mb-2 font-semibold">Visiteurs du site</h2>
            <PeriodFilter period={period} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-neutral-50 p-3">
                <div className="text-xs text-neutral-500">Visiteurs</div>
                <div className="text-2xl font-bold">{visites.visiteurs}</div>
              </div>
              <div className="rounded-lg bg-neutral-50 p-3">
                <div className="text-xs text-neutral-500">Pages vues</div>
                <div className="text-2xl font-bold">{visites.pages}</div>
              </div>
            </div>
            <div className="mt-3">
              <VisitChart tranches={visites.tranches} />
            </div>
            {visites.topPages.length > 0 && (
              <div className="mt-3 text-xs text-neutral-500">
                Pages les plus vues :{" "}
                {visites.topPages.map((p) => `${p === visites.topPages[0] ? "" : " · "}${p.path === "/" ? "Accueil" : p.path} (${p.n})`).join("")}
              </div>
            )}
            <p className="mt-2 text-xs text-neutral-500">
              Un visiteur = une personne par jour (sans cookie, robots exclus). Par heure sur une journée, par jour sinon.
            </p>
          </div>

          <div className="card">
            <h2 className="mb-3 font-semibold">Top 10 des questions posées</h2>
            {top.length === 0 && <p className="text-sm text-neutral-500">Pas encore de questions.</p>}
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {top.map((q, i) => (
                <li key={i}>
                  <span className="text-neutral-800">{q.representative}</span>{" "}
                  <span className="text-neutral-400">×{q.count}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Questions restées sans réponse</h2>
            <Link href="/admin/questions?onglet=sans-reponse" className="aj-link">
              Tout voir →
            </Link>
          </div>
          {unanswered.length === 0 && (
            <p className="text-sm text-neutral-500">Aucune — le bot a réponse à tout 🎉</p>
          )}
          <ul className="space-y-1 text-sm">
            {unanswered.map((q) => (
              <li key={q.id} className="flex items-center gap-2">
                <span className="badge badge-alerte">!</span>
                <Link href={`/admin/conversations/${q.waId}`} className="hover:underline">
                  {q.texte}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
