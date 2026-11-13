/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { FAQ, FORMATIONS, WA_GENERAL, type Offre } from "../data";
import { Wa } from "../wa-icon";

export const BASE = "";

export function slugOf(o: Offre): string {
  return o.titre
    .filter(Boolean)
    .join("-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
export const formationBySlug = (s: string): Offre | undefined => FORMATIONS.find((o) => slugOf(o) === s);

export const MENU: Array<[string, string]> = [
  ["/", "ACCUEIL"],
  [`${BASE}/formations`, "FORMATIONS"],
  [`${BASE}/societe`, "CRÉER UNE SOCIÉTÉ"],
  [`${BASE}/sourcing`, "FOURNISSEURS / SOURCING"],
  [`${BASE}/ghost-studio`, "GHOST STUDIO"],
  [`${BASE}/snapchat`, "COMPTES SNAPCHAT"],
  [`${BASE}/affiliation`, "AFFILIATION"],
  [`${BASE}/a-propos`, "À PROPOS"],
  [`${BASE}#rdv`, "RÉSERVER UN APPEL"],
];

/** Barre fixe : menu à gauche, Mon compte, logo à droite. */
export function Header() {
  return (
    <header className="v2-head">
      <details className="v2-menu">
        <summary aria-label="OUVRIR LE MENU">
          <span className="v2-burger">
            <i />
            <i />
            <i />
          </span>
          <span className="v2-menu-txt">MENU</span>
        </summary>
        <nav aria-label="Menu">
          {MENU.map(([h, l]) => (
            <a key={h} href={h}>
              {l}
            </a>
          ))}
          <Link href={`${BASE}/compte`} className="v2-menu-account">
            MON COMPTE →
          </Link>
        </nav>
      </details>
      <Link href={`${BASE}/compte`} className="v2-account" aria-label="Mon compte">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </Link>
      <Link href="/" className="v2-logo" aria-label="ARBI JACOB — accueil">
        <img src="/vitrine/logo.webp" alt="ARBI JACOB" />
      </Link>
    </header>
  );
}

export function FloatingWa() {
  return (
    <a className="v2-fab" href={WA_GENERAL} target="_blank" rel="noopener noreferrer" aria-label="Écrire au secrétariat sur WhatsApp">
      <Wa />
    </a>
  );
}

export function Jacob({ children, droite }: { children: React.ReactNode; droite?: boolean }) {
  return (
    <div className={`v2-jacob${droite ? " is-right" : ""}`} data-reveal>
      <img src="/vitrine/mascotte.webp" alt="" width={56} height={56} />
      <p>{children}</p>
    </div>
  );
}

/** Carte de formation entièrement cliquable → page dédiée. */
export function FormationCard({ o }: { o: Offre }) {
  return (
    <Link href={`${BASE}/formations/${slugOf(o)}`} className={`v2-fcard${o.phare ? " is-top" : ""}`} data-reveal>
      <small>{o.tag}</small>
      <h3>
        {o.titre[0]} {o.titre[1] && <span>{o.titre[1]}</span>}
      </h3>
      <p>{o.accroche}</p>
      <ul>
        {o.points.slice(0, 2).map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <div className="v2-fcard-foot">
        <b>{o.prix}</b>
        <span className="v2-go">
          VOIR LA FORMATION <i>→</i>
        </span>
      </div>
    </Link>
  );
}

/** Aperçu court d'une catégorie : bloc cliquable vers sa page. */
export function Apercu({ href, eyebrow, titre, points, cta }: { href: string; eyebrow: string; titre: React.ReactNode; points: string[]; cta: string }) {
  return (
    <Link href={href} className="v2-apercu" data-reveal>
      <small>{eyebrow}</small>
      <h3>{titre}</h3>
      <ul>
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <span className="v2-go">
        {cta} <i>→</i>
      </span>
    </Link>
  );
}

const FAQ_ICO = [
  "M3 6h18v12H3zM3 10h18M7 15h4",
  "M2 9l10-5 10 5-10 5zM6 11v5c2 2 4 3 6 3s4-1 6-3v-5",
  "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  "M4 5h16v11H9l-5 4zM9 10.5h.01M12 10.5h.01M15 10.5h.01",
];

export function Faq() {
  return (
    <section className="section v2-faq" data-reveal>
      <p className="v2-faq-eyebrow">
        <span className="slash" /> QUESTIONS FRÉQUENTES
      </p>
      <div className="v2-faq-list">
        {FAQ.map(([q, r], i) => (
          <details key={q}>
            <summary>
              <span className="v2-faq-ico" aria-hidden>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d={FAQ_ICO[i % FAQ_ICO.length]} />
                </svg>
              </span>
              <span className="v2-faq-q">{q}</span>
              <i aria-hidden>+</i>
            </summary>
            <p>{r}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** En-tête des pages dédiées. */
export function PageTop({ eyebrow, titre, intro }: { eyebrow: string; titre: React.ReactNode; intro?: string }) {
  return (
    <div className="v2-pagetop" data-reveal>
      <Link href="/" className="v2-back">
        ← ACCUEIL
      </Link>
      <p className="eyebrow">
        <span className="slash" /> {eyebrow}
      </p>
      <h1>{titre}</h1>
      {intro && <p className="v2-pagetop-intro">{intro}</p>}
    </div>
  );
}

export function Back() {
  return (
    <Link href="/" className="v2-go v2-backtop">
      ← ACCUEIL
    </Link>
  );
}
