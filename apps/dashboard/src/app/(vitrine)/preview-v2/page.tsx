/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { getRuntime } from "@/lib/core";
import { availability } from "@/lib/bookings";
import { BookingForm } from "../booking-form";
import { FORMATIONS, WA_GENERAL } from "../data";
import { Wa } from "../wa-icon";
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
      <section className="section v2-about" data-reveal>
        <img src="/vitrine/mascotte.webp" alt="" width={1000} height={907} />
        <div>
          <p className="eyebrow">
            <span className="slash" /> QUI SUIS-JE
          </p>
          <h2 className="v2-h2">JACOB.</h2>
          <ul className="v2-tags">
            <li>Entrepreneur</li>
            <li>Digital</li>
            <li>Import-export</li>
            <li>E-commerce</li>
            <li>Expérience terrain</li>
          </ul>
          <Link href={`${BASE}/a-propos`} className="v2-go">
            EN SAVOIR PLUS <i>→</i>
          </Link>
        </div>
      </section>

      {/* NOUVELLE ACCROCHE : rendez-vous */}
      <section className="section v2-band" id="rdv" data-reveal>
        <p className="eyebrow">
          <span className="slash" /> RÉSERVER UN APPEL
        </p>
        <h2 className="v2-h2">
          ON EN PARLE <span className="red-text">EN DIRECT.</span>
        </h2>
        <p className="v2-lead">15 min offertes ou 1 h à 25 €. Tous les jours, 20 h – minuit (heure de Paris).</p>
        <BookingForm avail={avail} />
      </section>

      <section className="v2-contact" data-reveal>
        <div>
          <b>UNE QUESTION ?</b>
          <span>Le secrétariat te répond sur WhatsApp.</span>
        </div>
        <a className="btn btn-whatsapp btn-compact" href={WA_GENERAL} target="_blank" rel="noopener noreferrer">
          <Wa /> PARLER AU SECRÉTARIAT
        </a>
      </section>

      <Faq />
    </>
  );
}
