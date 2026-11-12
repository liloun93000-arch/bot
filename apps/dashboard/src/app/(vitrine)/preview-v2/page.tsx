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
  { href: `${BASE}/societe`, n: "01", titre: "CRÉER MON BUSINESS", txt: "Société, LLC, LTD.", cls: "is-red" },
  { href: `${BASE}/sourcing`, n: "02", titre: "TROUVER UN FOURNISSEUR", txt: "Sourcing, Chine, import.", cls: "" },
  { href: `${BASE}/formations`, n: "03", titre: "ME FORMER", txt: "Formations business.", cls: "" },
  { href: `${BASE}/ghost-studio`, n: "04", titre: "DÉVELOPPER MON BUSINESS", txt: "Image, site, bot.", cls: "is-silver" },
];

export default function PreviewV2Home() {
  const avail = availability(getRuntime().core);
  return (
    <>
      {/* FORT : hero */}
      <section className="hero v2-hero" id="accueil">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="slash" /> L&apos;UNIVERS ARBI JACOB
          </p>
          <h1>
            LANCE TON BUSINESS.
            <br />
            <span className="red-text">ON S&apos;OCCUPE</span> DU RESTE.
          </h1>
          <p className="hero-intro">Formations, société, sourcing et digital. Une seule personne à contacter.</p>
          <div className="hero-actions">
            <a className="btn btn-brand" href="#objectif">
              TROUVER MON OFFRE <span className="arrow">↓</span>
            </a>
            <Link className="btn btn-silver" href={`${BASE}/formations`}>
              VOIR LES FORMATIONS
            </Link>
          </div>
        </div>
        <div className="hero-figure">
          <div className="figure-glow" />
          <img src="/vitrine/mascotte.webp" alt="Jacob, personnage masqué, travaillant sur un ordinateur" width={1000} height={907} />
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
