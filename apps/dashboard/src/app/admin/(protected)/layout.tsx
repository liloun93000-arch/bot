import { billingStatus } from "@arbi/core";
import { logoutAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { AdminIntro } from "./admin-intro";
import { BillingBanner } from "./billing-banner";
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
  const billing = billingStatus(core);
  const billingWarn = !billing.active || billing.balanceCents < 0;
  const paymentLink = core.settings.get("stripe_payment_link_url");

  // Tout le back-office vit sous /admin ; la racine du domaine est le site public.
  const nav: NavItem[] = [
    { href: "/admin", label: "Vue d'ensemble", icon: "home" },
    { href: "/admin/conversations", label: "Conversations", icon: "chat", badge: openAlerts, tone: "red" },
    { href: "/admin/leads", label: "Demandes / Leads", icon: "target", badge: nouveauxLeads, tone: "amber" },
    { href: "/admin/questions", label: "Questions", icon: "help" },
    { href: "/admin/apprentissage", label: "Apprentissage", icon: "cap" },
    { href: "/admin/manager-ia", label: "Apprentissage IA", icon: "brain", badge: enAttenteJacob, tone: "amber" },
    { href: "/admin/medias", label: "Photos clients", icon: "image" },
    { href: "/admin/catalogue", label: "Catalogue & tarifs", icon: "layers" },
    { href: "/admin/fichiers", label: "Fichiers du bot", icon: "clip" },
    { href: "/admin/site", label: "Site vitrine", icon: "globe" },
    { href: "/admin/facturation", label: "Abonnement", icon: "card", badge: billingWarn ? "!" : 0, tone: "amber" },
    { href: "/admin/reglages", label: "Réglages", icon: "gear" },
  ];

  const tabs: TabItem[] = [
    { href: "/admin", label: "Accueil", icon: "home" },
    { href: "/admin/conversations", label: "Conversations", icon: "chat", badge: openAlerts },
    { href: "/admin/manager-ia", label: "Jacob", icon: "headset", badge: enAttenteJacob },
    { href: "/admin/medias", label: "Médias", icon: "image" },
    { href: "/admin/reglages", label: "Paramètres", icon: "gear" },
  ];

  const alerts: BellAlert[] = core.alerts
    .open()
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      waId: a.waId,
      nom: core.contacts.get(a.waId)?.nom || `+${a.waId}`,
      categorie: a.categorie,
      texte: a.dernierMessage || a.motif,
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
      <AdminIntro />
      <NavShell
        nav={nav}
        tabs={tabs}
        alerts={alerts}
        alertCount={openAlerts}
        userName={user}
        botActif={botActif}
        logoutForm={logoutForm}
      >
        <BillingBanner billing={billing} paymentLink={paymentLink} />
        {children}
      </NavShell>
    </div>
  );
}
