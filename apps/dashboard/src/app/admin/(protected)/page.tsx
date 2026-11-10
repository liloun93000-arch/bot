import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
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

export default async function OverviewPage() {
  await requireSession();
  const { core } = getRuntime();

  // ── Accueil (présentation mobile) ──
  const stats = homeStats(core);
  const enAttenteJacob = core.knowledge.escalations.countOpen();
  const alertesOuvertes = core.alerts.countOpen();
  const recentes = recentConversations(core, 3);
  const themes = themeCounts(core, 4);
  const photos = clientPhotos(core, 8);

  // ── Statistiques détaillées (inchangées) ──
  const [day, week, month] = [computeKpis(core, DAY), computeKpis(core, 7 * DAY), computeKpis(core, 30 * DAY)];
  const openAlerts = core.alerts.open();
  const nouveauxLeads = core.leads.countNouveaux();
  const top = topQuestions(core, 10);
  const unanswered = core.questions.unanswered(10);
  const maxCat = Math.max(1, ...month.parCategorie.map((c) => c.n));

  return (
    <div className="aj-home">
      {/* ───── Hero ───── */}
      <section className="aj-hero aj-rise">
        <div className="aj-hero-eyebrow">Dashboard Bot</div>
        <h1>
          <span className="aj-arbi">ARBI</span> <span className="aj-jacob">Jacob</span>
        </h1>
        <p className="aj-hero-sub">
          <Icon name="whatsapp" size={30} />
          <span>Gestion et suivi de votre bot WhatsApp</span>
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/api/brand/mascot.webp" alt="" className="aj-mascot" />
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
          href="/admin/manager-ia"
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
        <Stat
          href="/admin/conversations?statut=bot"
          icon="gear"
          label={
            <>
              Réponses
              <br />
              automatiques
            </>
          }
          value={stats.autoReplies.value}
          index={3}
        >
          <DeltaBadge delta={stats.autoReplies.delta} />
        </Stat>
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
          href="/admin/conversations?statut=alerte"
          className={`aj-validate aj-rise ${alertesOuvertes > 0 ? "is-live" : ""}`}
          style={idx(8)}
        >
          <span className="aj-validate-ico">
            <Icon name="headset" size={34} />
          </span>
          <span className="min-w-0">
            <span className="aj-validate-title block">Validation Jacob requise</span>
            <span className="aj-validate-sub block">Conversations à traiter manuellement</span>
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
              <Link href="/admin/conversations?statut=alerte" className="text-sm text-red-600 underline">
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
            <div className="label">Résolution sans humain (7 j)</div>
            <div className="text-3xl font-bold">
              {week.tauxResolution === null ? "—" : `${week.tauxResolution} %`}
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
                label="Résolution sans humain"
                values={[day, week, month].map((p) =>
                  p.tauxResolution === null ? "—" : `${p.tauxResolution} %`,
                )}
              />
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <h2 className="mb-3 font-semibold">Demandes par catégorie (30 j)</h2>
            {month.parCategorie.length === 0 && (
              <p className="text-sm text-neutral-500">Aucune demande enregistrée.</p>
            )}
            <div className="space-y-2">
              {month.parCategorie.map((c) => (
                <div key={c.categorie} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-sm">{c.categorie}</span>
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
