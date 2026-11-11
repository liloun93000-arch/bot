import Link from "next/link";
import type { ReactNode } from "react";
import { FAQ, NAV, WA_DISPLAY, wa, type Formation } from "./data";

export function WaIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

export function WaButton({ message, children, big = false }: { message?: string; children: ReactNode; big?: boolean }) {
  return (
    <a className={`cv-btn cv-btn-wa${big ? " is-big" : ""}`} href={wa(message)} target="_blank" rel="noopener noreferrer">
      <WaIcon /> {children}
    </a>
  );
}

export function Header() {
  return (
    <header className="cv-header">
      <div className="cv-wrap cv-header-in">
        <Link href="/" className="cv-logo" aria-label="Jacob — accueil">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/brand/logo.webp" alt="" />
          <span>Jacob</span>
        </Link>
        <nav className="cv-nav-desk" aria-label="Menu">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}>
              {n.label}
            </Link>
          ))}
        </nav>
        <details className="cv-nav-mob">
          <summary aria-label="Ouvrir le menu">
            <span />
            <span />
            <span />
          </summary>
          <nav aria-label="Menu">
            {NAV.map((n, i) => (
              <Link key={n.href} href={n.href}>
                <b>{i + 1}.</b> {n.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}

export function Faq() {
  return (
    <section className="cv-section cv-faq">
      <div className="cv-wrap">
        <h2 className="cv-h2">Questions fréquentes</h2>
        <div className="cv-faq-list">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.r}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="cv-footer">
      <div className="cv-wrap">
        <p>
          Formateur officiel de China Access →{" "}
          <a href="https://chinacces.com" target="_blank" rel="noopener noreferrer">
            chinacces.com
          </a>
        </p>
        <p>
          WhatsApp : <a href={wa()}>{WA_DISPLAY}</a> · Réponse rapide, 7 jours sur 7.
        </p>
        <p className="cv-footer-small">
          © {new Date().getFullYear()} Jacob ·{" "}
          <Link href="/admin/login" className="cv-admin">
            Espace admin
          </Link>
        </p>
      </div>
    </footer>
  );
}

/** Bouton WhatsApp flottant, sur toutes les pages. */
export function FloatingWa() {
  return (
    <a className="cv-float" href={wa("Bonjour Jacob, j'ai une question.")} target="_blank" rel="noopener noreferrer">
      <WaIcon size={22} />
      <span>Une question ? Écris-nous</span>
    </a>
  );
}

export function PageHead({ kicker, titre, sous }: { kicker?: string; titre: string; sous?: string }) {
  return (
    <section className="cv-pagehead">
      <div className="cv-wrap">
        {kicker && <p className="cv-kicker">{kicker}</p>}
        <h1 className="cv-h1">{titre}</h1>
        {sous && <p className="cv-lead">{sous}</p>}
      </div>
    </section>
  );
}

export function FormationCard({ f }: { f: Formation }) {
  return (
    <article className="cv-card cv-offer">
      <div className="cv-offer-top">
        <h3>{f.titre}</h3>
        <span className="cv-price">{f.prix}</span>
      </div>
      <p className="cv-offer-acc">{f.accroche}</p>
      <ul className="cv-points">
        {f.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <a
        className={`cv-btn ${f.externe ? "cv-btn-red" : "cv-btn-wa"}`}
        href={f.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {!f.externe && <WaIcon />} {f.bouton}
      </a>
      {f.encart && (
        <div className="cv-encart">
          <span>{f.encart.texte}</span>
          {f.encart.href && (
            <a href={f.encart.href} target="_blank" rel="noopener noreferrer" className="cv-encart-link">
              <WaIcon size={16} /> {f.encart.bouton}
            </a>
          )}
        </div>
      )}
    </article>
  );
}
