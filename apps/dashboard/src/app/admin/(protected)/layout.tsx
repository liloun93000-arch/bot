import { logoutAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { TabGuard } from "./tab-guard";
import { jacobPending, jacobPendingCount } from "@/lib/jacob";
import { AdminIntro } from "./admin-intro";
import { Icon } from "./icons";
import { NavShell, type BellAlert, type NavItem, type TabItem } from "./nav-shell";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const { core } = getRuntime();
  const openAlerts = core.alerts.countOpen();
  const nouveauxLeads = core.leads.countNouveaux();
  const enAttenteJacob = core.knowledge.escalations.countOpen();
  const botActif = Boolean(core.settings.get("bot_actif"));
  // Compteur unique « à traiter par Jacob » : questions inconnues + alertes ouvertes.
  const jacobCount = jacobPendingCount(core);

  // Tout le back-office vit sous /admin ; la racine du domaine est le site public.
  const nav: NavItem[] = [
    { href: "/admin", label: "Vue d'ensemble", icon: "home" },
    { href: "/admin/conversations", label: "Conversations", icon: "chat", badge: openAlerts, tone: "red" },
    { href: "/admin/leads", label: "Demandes / Leads", icon: "target", badge: nouveauxLeads, tone: "amber" },
    { href: "/admin/questions", label: "Questions", icon: "help" },
    { href: "/admin/apprentissage", label: "Apprentissage", icon: "cap" },
    { href: "/admin/jacob", label: "Demandes de Jacob", icon: "headset", badge: jacobCount, tone: "red" },
    { href: "/admin/manager-ia", label: "Apprentissage IA", icon: "brain", badge: enAttenteJacob, tone: "amber" },
    { href: "/admin/medias", label: "Photos clients", icon: "image" },
    { href: "/admin/catalogue", label: "Catalogue & tarifs", icon: "layers" },
    { href: "/admin/fichiers", label: "Fichiers du bot", icon: "clip" },
    { href: "/admin/site", label: "Site vitrine", icon: "globe" },
    { href: "/admin/reglages", label: "Réglages", icon: "gear" },
  ];

  const tabs: TabItem[] = [
    { href: "/admin", label: "Accueil", icon: "home" },
    { href: "/admin/conversations", label: "Conversations", icon: "chat", badge: openAlerts },
    { href: "/admin/jacob", label: "Jacob", icon: "headset", badge: jacobCount },
    { href: "/admin/medias", label: "Médias", icon: "image" },
    { href: "/admin/reglages", label: "Paramètres", icon: "gear" },
  ];

  // Cloche : les mêmes demandes que l'onglet Jacob (questions inconnues + alertes).
  const alerts: BellAlert[] = jacobPending(core)
    .slice(0, 5)
    .map((r) => ({
      id: r.key,
      waId: r.waId,
      nom: r.nom,
      categorie: r.kind === "question" ? "Question inconnue" : "Alerte",
      texte: r.question,
      href: "/admin/jacob",
    }));

  const logoutForm = (
    <form action={logoutAction}>
      <button type="submit" className="flex items-center gap-2 hover:text-white">
        <Icon name="logout" size={18} /> Déconnexion
      </button>
    </form>
  );

  return (
    <div className="aj-shell">
      <TabGuard />
      <AdminIntro />
      <NavShell
        nav={nav}
        tabs={tabs}
        alerts={alerts}
        alertCount={jacobCount}
        userName={user}
        botActif={botActif}
        logoutForm={logoutForm}
      >
        {children}
      </NavShell>
    </div>
  );
}
