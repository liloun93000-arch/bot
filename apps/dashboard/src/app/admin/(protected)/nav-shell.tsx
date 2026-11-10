"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Pastille : nombre à afficher (0/absent = rien) et teinte. */
  badge?: number | "!";
  tone?: "red" | "amber";
}

export interface TabItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
}

export interface BellAlert {
  id: number | string;
  waId: string;
  nom: string;
  categorie: string;
  texte: string;
  /** Destination du clic (par défaut : la conversation). */
  href?: string;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Referme une fenêtre flottante sur clic extérieur ou Échap (jamais sur défilement). */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

/**
 * Coque de navigation du back-office.
 *
 *  - Mobile : en-tête compact (hamburger · logo · notifications · profil),
 *    barre d'onglets fixe en bas, menu latéral en tiroir.
 *  - Ordinateur : menu latéral fixe, en-tête allégé (notifications · profil).
 *
 * Comportement du menu mobile (exigence conservée) : une fois OUVERT, il reste
 * ouvert et stable. Il ne se ferme PAS au défilement, au balayage ni à un clic
 * sur le fond. Il ne se ferme que :
 *  - avec la croix ;
 *  - quand on choisit volontairement une rubrique.
 * Pendant l'ouverture, la page derrière est verrouillée.
 */
export function NavShell({
  nav,
  tabs,
  alerts,
  alertCount,
  userName,
  botActif,
  logoutForm,
  children,
}: {
  nav: NavItem[];
  tabs: TabItem[];
  alerts: BellAlert[];
  alertCount: number;
  userName: string;
  botActif: boolean;
  logoutForm: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Un changement de page ferme les fenêtres flottantes (pas le tiroir : il se ferme au clic sur un lien).
  useEffect(() => {
    setBellOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  const bellRef = useDismiss(bellOpen, () => setBellOpen(false));
  const profileRef = useDismiss(profileOpen, () => setProfileOpen(false));
  const initial = (userName.trim()[0] ?? "?").toUpperCase();

  return (
    <>
      {/* Fond : purement visuel, aucun gestionnaire de clic (un appui accidentel ne ferme rien). */}
      {open && <div aria-hidden className="aj-scrim" />}

      <aside
        className={`aj-drawer ${open ? "is-open" : ""}`}
        aria-label="Menu principal"
        // Choisir une rubrique referme le tiroir (autorisé) ; rien d'autre.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        <div className="aj-drawer-head">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/brand/logo.webp" alt="ARBI JACOB" className="aj-logo" style={{ height: 60 }} />
            <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: "var(--aj-gray)" }}>
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: botActif ? "var(--aj-green)" : "var(--aj-red-bright)",
                  boxShadow: `0 0 8px ${botActif ? "rgba(52,211,153,.7)" : "var(--aj-red-glow)"}`,
                }}
              />
              Bot {botActif ? "actif" : "désactivé"}
            </div>
          </div>
          <button type="button" aria-label="Fermer le menu" onClick={() => setOpen(false)} className="aj-iconbtn aj-drawer-close">
            <Icon name="close" />
          </button>
        </div>
        <nav className="aj-drawer-nav">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="aj-navlink"
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
            >
              <Icon name={item.icon} size={21} />
              <span>{item.label}</span>
              {item.badge ? (
                <span className={`aj-count ${item.tone === "amber" ? "is-amber" : ""}`}>{item.badge}</span>
              ) : null}
            </Link>
          ))}
          <a href="/" target="_blank" rel="noopener" className="aj-navlink" style={{ color: "var(--aj-gray)" }}>
            <Icon name="external" size={21} />
            <span>Voir le site</span>
          </a>
        </nav>
        <div className="aj-drawer-foot">
          <span className="flex items-center gap-2 truncate">
            <Icon name="user" size={18} /> {userName}
          </span>
          {logoutForm}
        </div>
      </aside>

      <div className="aj-shell-body">
        <header className="aj-header">
          <div className="aj-header-left">
            <button
              type="button"
              aria-label="Ouvrir le menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              className="aj-iconbtn is-plain aj-burger"
            >
              <Icon name="menu" size={28} />
            </button>
          </div>

          <Link href="/admin" aria-label="ARBI JACOB — accueil" className="aj-logo-center aj-press">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/brand/logo.webp" alt="ARBI JACOB" className="aj-logo" />
          </Link>

          <div className="aj-header-right">
            <div ref={bellRef} className="relative">
              <button
                type="button"
                aria-label={`Notifications${alertCount ? ` (${alertCount})` : ""}`}
                aria-expanded={bellOpen}
                onClick={() => {
                  setBellOpen((v) => !v);
                  setProfileOpen(false);
                }}
                className="aj-iconbtn"
              >
                <Icon name="bell" size={21} />
                {alertCount > 0 && <span className="aj-dot">{alertCount > 99 ? "99+" : alertCount}</span>}
              </button>
              {bellOpen && (
                <div className="aj-pop" role="dialog" aria-label="Notifications">
                  <div className="px-3.5 py-3 text-sm font-semibold" style={{ borderBottom: "1px solid var(--aj-line)" }}>
                    {alertCount > 0 ? `${alertCount} demande${alertCount > 1 ? "s" : ""} en attente de Jacob` : "Aucune notification"}
                  </div>
                  {alerts.map((a) => (
                    <Link key={a.id} href={a.href ?? `/admin/conversations/${a.waId}`} className="aj-pop-item">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{a.nom}</span>
                        <span className="badge badge-alerte shrink-0">{a.categorie}</span>
                      </div>
                      <div className="truncate text-xs" style={{ color: "var(--aj-gray)" }}>
                        {a.texte}
                      </div>
                    </Link>
                  ))}
                  {alertCount > 0 && (
                    <Link
                      href="/admin/jacob"
                      className="aj-pop-item aj-link"
                      style={{ justifyContent: "center", textAlign: "center" }}
                    >
                      Tout voir
                    </Link>
                  )}
                </div>
              )}
            </div>

            <div ref={profileRef} className="relative">
              <button
                type="button"
                aria-label="Profil"
                aria-expanded={profileOpen}
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setBellOpen(false);
                }}
                className="aj-iconbtn"
              >
                <Icon name="user" size={22} />
              </button>
              {profileOpen && (
                <div className="aj-pop" role="dialog" aria-label="Profil">
                  <div className="flex items-center gap-3 px-3.5 py-3" style={{ borderBottom: "1px solid var(--aj-line)" }}>
                    <span className="aj-avatar" style={{ width: 36, height: 36, fontSize: "0.95rem" }}>
                      {initial}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{userName}</div>
                      <div className="text-xs" style={{ color: "var(--aj-gray)" }}>
                        Back-office ARBI JACOB
                      </div>
                    </div>
                  </div>
                  <Link href="/admin/reglages" className="aj-pop-item">
                    Réglages
                  </Link>
                  <div className="aj-pop-item">{logoutForm}</div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="aj-main aj-page" key={pathname}>
          {children}
        </main>
      </div>

      <nav className="aj-bottomnav" aria-label="Navigation rapide">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="aj-tab"
            aria-current={isActive(pathname, tab.href) ? "page" : undefined}
          >
            <Icon name={tab.icon} size={23} />
            <span>{tab.label}</span>
            {tab.badge ? <span className="aj-dot">{tab.badge > 99 ? "99+" : tab.badge}</span> : null}
          </Link>
        ))}
      </nav>
    </>
  );
}
