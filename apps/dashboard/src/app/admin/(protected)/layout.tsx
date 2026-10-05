import Link from "next/link";
import { billingStatus } from "@arbi/core";
import { logoutAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { AdminIntro } from "./admin-intro";
import { BillingBanner } from "./billing-banner";
import { NavShell } from "./nav-shell";

export const dynamic = "force-dynamic";

// Tout le back-office vit sous /admin ; la racine du domaine est le site public.
const NAV = [
  { href: "/admin", label: "Vue d'ensemble", icon: "📊" },
  { href: "/admin/conversations", label: "Conversations", icon: "💬" },
  { href: "/admin/leads", label: "Demandes / Leads", icon: "🎯" },
  { href: "/admin/questions", label: "Questions", icon: "❓" },
  { href: "/admin/apprentissage", label: "Apprentissage", icon: "🎓" },
  { href: "/admin/manager-ia", label: "Apprentissage IA", icon: "🧠" },
  { href: "/admin/catalogue", label: "Catalogue & tarifs", icon: "🗂️" },
  { href: "/admin/fichiers", label: "Fichiers du bot", icon: "📎" },
  { href: "/admin/site", label: "Site vitrine", icon: "🌐" },
  { href: "/admin/facturation", label: "Abonnement", icon: "💳" },
  { href: "/admin/reglages", label: "Réglages", icon: "⚙️" },
];

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const { core } = getRuntime();
  const openAlerts = core.alerts.countOpen();
  const nouveauxLeads = core.leads.countNouveaux();
  const enAttenteJacob = core.knowledge.escalations.countOpen();
  const botActif = core.settings.get("bot_actif");
  const billing = billingStatus(core);
  const billingWarn = !billing.active || billing.balanceCents < 0;
  const paymentLink = core.settings.get("stripe_payment_link_url");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AdminIntro />
      <NavShell
        brand={
          <div>
            <div className="text-lg font-bold">ARBI JACOB</div>
            <div className="text-xs text-neutral-400">Bot {botActif ? "🟢 actif" : "🔴 désactivé"}</div>
          </div>
        }
        footer={
          <>
            <span>👤 {user}</span>
            <form action={logoutAction}>
              <button type="submit" className="hover:text-white">
                Déconnexion
              </button>
            </form>
          </>
        }
      >
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-neutral-800"
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {item.href === "/admin/conversations" && openAlerts > 0 && (
              <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold">{openAlerts}</span>
            )}
            {item.href === "/admin/leads" && nouveauxLeads > 0 && (
              <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-black">
                {nouveauxLeads}
              </span>
            )}
            {item.href === "/admin/manager-ia" && enAttenteJacob > 0 && (
              <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-black">
                {enAttenteJacob}
              </span>
            )}
            {item.href === "/admin/facturation" && billingWarn && (
              <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-black">!</span>
            )}
          </Link>
        ))}
        <a
          href="/"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          <span>↗</span>
          <span>Voir le site</span>
        </a>
      </NavShell>
      <main className="flex-1 p-4 md:p-6">
        <BillingBanner billing={billing} paymentLink={paymentLink} />
        {children}
      </main>
    </div>
  );
}
