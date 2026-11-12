/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { getRuntime } from "@/lib/core";
import { availability } from "@/lib/bookings";
import { BookingForm } from "../booking-form";
import { FORMATIONS, WA_GENERAL } from "../data";
import { Diagnostic } from "./diagnostic";
import { Apercu, BASE, Faq, FormationCard, Jacob } from "./ui";

export const dynamic = "force-dynamic";

const OBJECTIFS = [
  { href: `${BASE}/societe`, n: "01", titre: "CRÉER MON BUSINESS", txt: "Société, LLC, LTD.", cls: "is-build", icon: "build" },
  { href: `${BASE}/sourcing`, n: "02", titre: "TROUVER UN FOURNISSEUR", txt: "Sourcing, Chine, import.", cls: "is-globe", icon: "globe" },
  { href: `${BASE}/formations`, n: "03", titre: "ME FORMER", txt: "Formations business.", cls: "is-learn", icon: "learn" },
  { href: `${BASE}/ghost-studio`, n: "04", titre: "DÉVELOPPER MON ACTIVITÉ", txt: "Image, site, bot.", cls: "is-grow", icon: "grow" },
] as const;

function GoalIcon({ name }: { name: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden className="v2-goalicon">
      {name === "build" && (
        <>
          <path {...p} d="M8 40h32M12 40V18l12-8 12 8v22" />
          <path {...p} d="M20 40v-9h8v9M18 24h2M28 24h2" />
        </>
      )}
      {name === "globe" && (
        <>
          <circle {...p} cx="24" cy="24" r="15" />
          <path {...p} d="M9 24h30M24 9c5 5 5 25 0 30M24 9c-5 5-5 25 0 30" />
          <circle cx="33" cy="17" r="2.2" fill="currentColor" />
        </>
      )}
      {name === "learn" && (
        <>
          <path {...p} d="M6 19l18-8 18 8-18 8z" />
          <path {...p} d="M14 23v8c3 3 7 4 10 4s7-1 10-4v-8M42 19v10" />
        </>
      )}
      {name === "grow" && (
        <>
          <path {...p} d="M8 38l10-11 7 6 14-16" />
          <path {...p} d="M31 17h8v8" />
          <path {...p} d="M8 42h32" />
        </>
      )}
    </svg>
  );
}

const QUI_TAGS: Array<[string, string]> = [
  ["M4 20V10M10 20V4M16 20v-7M22 20H2", "Entrepreneur"],
  ["M3 5h18v11H3zM1 19h22", "Digital"],
  ["M3 8l9-4 9 4v10l-9 4-9-4zM3 8l9 4 9-4M12 12v10", "Import-export"],
  ["M3 4h2l2.5 11h11L21 8H6.5M10 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z", "E-commerce"],
  ["M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 13a1 1 0 100-2 1 1 0 000 2z", "Expérience terrain"],
];

export default function PreviewV2Home() {
  const avail = availability(getRuntime().core);
  return (
    <>
      {/* SCÈNE D'OUVERTURE : visuelle avant d'être commerciale */}
      <section className="v2-scene" id="accueil" aria-label="ARBI JACOB">
        <div className="v2-scene-bg" aria-hidden>
          <span className="v2-scene-glow" />
          <span className="v2-scene-floor" />
          <span className="v2-scene-arc v2-scene-arc--1" />
          <span className="v2-scene-arc v2-scene-arc--2" />
        </div>
        <div className="v2-scene-jacob" aria-hidden>
          <span className="v2-scene-halo" />
          <img src="/vitrine/mascotte.webp" alt="" width={1000} height={907} fetchPriority="high" />
        </div>
        <div className="v2-scene-copy">
          <p className="v2-scene-eyebrow">
            <span className="slash" /> ARBI JACOB
          </p>
          <h1 className="v2-scene-title">
            <span>TON BUSINESS</span>
            <span className="red-text">COMMENCE ICI.</span>
          </h1>
          <p className="v2-scene-sub">Formations, société, sourcing et digital — de la France à la Chine.</p>
          <a className="btn btn-brand v2-scene-cta" href="#objectif">
            ENTRER DANS L&apos;UNIVERS <span className="arrow">↓</span>
          </a>
        </div>
        <div className="v2-scene-cities" aria-hidden>
          <span>PARIS</span>
          <i />
          <span>SHENZHEN</span>
          <i />
          <span>HONG KONG</span>
          <i />
          <span>NEW YORK</span>
        </div>
      </section>

      {/* CALME : objectif */}
      <section className="section v2-goal" id="objectif">
        <h2 className="v2-h2" data-reveal>
          QUEL EST TON <span className="red-text">OBJECTIF</span> ?
        </h2>
        <div className="v2-goals">
          {OBJECTIFS.map((g) => (
            <Link key={g.href} href={g.href} className={`v2-goalcard ${g.cls}`} data-reveal>
              <GoalIcon name={g.icon} />
              <small>{g.n}</small>
              <b>{g.titre}</b>
              <span>{g.txt}</span>
              <i aria-hidden>→</i>
            </Link>
          ))}
        </div>
      </section>

      <Jacob>Tu ne sais pas par où commencer ? Réponds à 2 questions, je t&apos;oriente.</Jacob>
      <section className="section v2-diag-wrap v2-tight" id="diagnostic" data-reveal>
        <p className="eyebrow">
          <span className="slash" /> TROUVE CE QU&apos;IL TE FAUT EN 30 SECONDES
        </p>
        <Diagnostic />
      </section>

      {/* CARTES : formations en vedette */}
      <section className="section v2-band" id="formations">
        <div className="v2-row-head" data-reveal>
          <h2 className="v2-h2">FORMATIONS</h2>
          <Link href={`${BASE}/formations`} className="v2-go">
            TOUTES <i>→</i>
          </Link>
        </div>
        <div className="v2-fgrid">
          {FORMATIONS.slice(0, 4).map((o) => (
            <FormationCard key={o.tag} o={o} />
          ))}
        </div>
      </section>

      {/* CALME : aperçus courts */}
      <section className="section">
        <div className="v2-apercus">
          <Apercu
            href={`${BASE}/societe`}
            eyebrow="CRÉER MA SOCIÉTÉ"
            titre={
              <>
                LLC USA · <span className="red-text">LTD HONG KONG</span>
              </>
            }
            points={["Création à distance", "3 formules, dès 545 €", "Accompagnement inclus"]}
            cta="VOIR LES OFFRES"
          />
          <Apercu
            href={`${BASE}/sourcing`}
            eyebrow="SOURCING"
            titre="LE BON FOURNISSEUR"
            points={["Tu exprimes ton besoin", "On cherche le fournisseur", "Chine et import-export"]}
            cta="EN SAVOIR PLUS"
          />
          <Apercu
            href={`${BASE}/ghost-studio`}
            eyebrow="PARTENAIRE"
            titre="GHOST STUDIO"
            points={["Graphisme & identité visuelle", "Sites et Shopify", "Bots et automatisations"]}
            cta="DÉCOUVRIR GHOST STUDIO"
          />
        </div>
      </section>

      {/* VISUEL JACOB */}
      <section className="v2-qui" data-reveal>
        <div className="v2-qui-visual">
          <img src="/vitrine/jacob-qui.webp" alt="Jacob devant son ordinateur, Shanghai en arrière-plan" width={640} height={691} loading="lazy" />
        </div>
        <div className="v2-qui-copy">
          <p className="v2-qui-eyebrow">
            <span className="slash" /> QUI SUIS-JE ?
          </p>
          <h2 className="v2-qui-title">
            JACOB<span>.</span>
          </h2>
          <p className="v2-qui-txt">
            Entrepreneur du digital, de l&apos;<b>import-export</b> et du e-commerce, j&apos;accompagne celles et ceux qui veulent lancer,
            structurer et <b>faire grandir</b> un vrai business.
          </p>
          <ul className="v2-qui-tags">
            {QUI_TAGS.map(([ic, t]) => (
              <li key={t}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={ic} />
                </svg>
                {t}
              </li>
            ))}
          </ul>
          <Link href={`${BASE}/a-propos`} className="btn btn-brand v2-qui-btn">
            EN SAVOIR PLUS <span className="arrow">→</span>
          </Link>
        </div>
      </section>

      {/* NOUVELLE ACCROCHE : rendez-vous */}
      <section className="section v2-rdv" id="rdv" data-reveal>
        <p className="v2-rdv-eyebrow">
          <span className="slash" /> RÉSERVER UN APPEL
        </p>
        <h2 className="v2-rdv-title">
          ON EN PARLE
          <br />
          <span className="red-text">EN DIRECT ?</span>
        </h2>
        <p className="v2-rdv-lead">Un échange concret pour avancer sur ton projet, obtenir des conseils et définir la meilleure stratégie.</p>
        <BookingForm avail={avail} v2 />
      </section>

      <section className="v2-ask" data-reveal>
        <div className="v2-ask-ico" aria-hidden>
          <img src="/vitrine/whatsapp.svg" alt="" width={44} height={44} />
        </div>
        <div className="v2-ask-body">
          <h2>
            UNE QUESTION <span className="red-text">?</span>
          </h2>
          <p>Notre secrétaire te répond sur WhatsApp.</p>
          <a className="v2-ask-btn" href={WA_GENERAL} target="_blank" rel="noopener noreferrer">
            <img src="/vitrine/whatsapp.svg" alt="" width={22} height={22} /> PARLER AU SECRÉTARIAT <span>→</span>
          </a>
        </div>
      </section>

      <Faq />
    </>
  );
}
