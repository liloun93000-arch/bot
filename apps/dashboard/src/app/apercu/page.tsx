/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { getRuntime } from "@/lib/core";
import { availability } from "@/lib/bookings";
import { BookingForm } from "./booking-form";
import { FAQ, FORMATIONS, GHOST_PRIX, GHOST_WA, LLC, NAV, WA_GENERAL, waOffre, type Offre } from "./data";
import { Wa } from "./wa-icon";

export const dynamic = "force-dynamic";

function OffreCard({ o }: { o: Offre }) {
  return (
    <article className={`course-card ${o.phare ? "course-card--primary" : "course-card--secondary"} kv-offer`}>
      <div className="card-mark">{o.tag}</div>
      <h3>
        {o.titre[0]}
        {o.titre[1] && (
          <>
            <br />
            <span>{o.titre[1]}</span>
          </>
        )}
      </h3>
      <p className="kv-price">{o.prix}</p>
      <p>{o.accroche}</p>
      <ul className="kv-points">
        {o.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <a className={`btn ${o.wa ? "btn-whatsapp" : "btn-brand"} btn-compact`} href={o.href} target="_blank" rel="noopener noreferrer">
        {o.wa && <Wa />} {o.bouton} {!o.wa && <span className="arrow">↗</span>}
      </a>
      {o.encart && (
        <div className="kv-encart">
          <span>{o.encart.texte}</span>
          {o.encart.href && (
            <a className="btn btn-whatsapp btn-whatsapp--outline btn-whatsapp--compact" href={o.encart.href} target="_blank" rel="noopener noreferrer">
              <Wa /> {o.encart.bouton}
            </a>
          )}
        </div>
      )}
    </article>
  );
}

function Faq() {
  return (
    <section className="section kv-faq">
      <div className="section-heading">
        <p className="eyebrow">
          <span className="slash" /> QUESTIONS FRÉQUENTES
        </p>
      </div>
      <div className="kv-faq-list">
        {FAQ.map(([q, r]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{r}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export default function ApercuVitrine() {
  const avail = availability(getRuntime().core);
  return (
    <>
      <div className="kv-preview-bar">APERÇU DE TRAVAIL — NON PUBLIÉ · <Link href="/admin">RETOUR AU DASHBOARD</Link></div>
      <header className="site-header kv-header">
        <a className="brand" href="#accueil" aria-label="ARBI JACOB — accueil">
          <img src="/vitrine/logo.webp" alt="ARBI JACOB" />
        </a>
        <nav className="desktop-nav" aria-label="Navigation">
          {NAV.slice(1, 8).map(([h, l]) => (
            <a key={h} href={h}>
              {l}
            </a>
          ))}
        </nav>
        <a className="btn btn-whatsapp btn-compact kv-head-cta" href={WA_GENERAL} target="_blank" rel="noopener noreferrer">
          <Wa /> <span>CONTACTER LE SECRÉTARIAT</span>
        </a>
        <details className="kv-menu">
          <summary className="menu-toggle" aria-label="OUVRIR LE MENU">
            <span />
            <span />
            <span />
          </summary>
          <nav aria-label="Menu">
            {NAV.map(([h, l]) => (
              <a key={h} href={h}>
                {l}
              </a>
            ))}
            <a className="btn btn-whatsapp" href={WA_GENERAL} target="_blank" rel="noopener noreferrer">
              <Wa /> CONTACTER LE SECRÉTARIAT
            </a>
          </nav>
        </details>
      </header>

      <main>
        <section className="hero" id="accueil">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="slash" /> BUSINESS • MARKETING • E-COMMERCE
            </p>
            <h1>
              LANCE TON BUSINESS.
              <br />
              <span className="red-text">ON S&apos;OCCUPE</span>
              <br />
              DU RESTE.
            </h1>
            <p className="hero-intro">
              Formations, société, sourcing et services digitaux. Une seule personne à contacter, une réponse rapide sur WhatsApp.
            </p>
            <div className="hero-actions">
              <a className="btn btn-brand" href="#formations">
                DÉCOUVRIR LES FORMATIONS <span className="arrow">↗</span>
              </a>
              <a className="btn btn-whatsapp" href={WA_GENERAL} target="_blank" rel="noopener noreferrer">
                <Wa /> CONTACTER LE SECRÉTARIAT
              </a>
            </div>
            <div className="hero-trust">
              <span>À DISTANCE</span>
              <i />
              <span>CONTACT WHATSAPP</span>
              <i />
              <span>EXPÉRIENCE CONCRÈTE</span>
            </div>
          </div>
          <div className="hero-figure">
            <div className="figure-glow" />
            <img src="/vitrine/mascotte.webp" alt="Personnage masqué de Jacob travaillant sur un ordinateur" width={1000} height={907} />
            <span className="figure-caption">LE DIGITAL, CONSTRUIT EN PRATIQUE</span>
          </div>
          <div className="hero-sheen" />
        </section>

        <section className="section kv-doors">
          <a href="#formations" className="kv-door kv-door--big">
            <small>01</small>
            <b>FORMATIONS</b>
            <span>Méthodes appliquées, expérience concrète.</span>
          </a>
          <a href="#llc" className="kv-door kv-door--red">
            <small>02</small>
            <b>LLC / LTD</b>
            <span>Ta société à l&apos;étranger, à distance.</span>
          </a>
          <a href="#snapchat" className="kv-door">
            <small>03</small>
            <b>COMPTES SNAPCHAT</b>
            <span>Catalogue et prix sur WhatsApp.</span>
          </a>
          <a href="#digital" className="kv-door kv-door--silver">
            <small>04</small>
            <b>GRAPHISME & DIGITAL</b>
            <span>Avec Ghost Studio, studio partenaire.</span>
          </a>
          <a className="kv-ca" href="https://chinacces.com" target="_blank" rel="noopener noreferrer">
            FORMATEUR CHINA ACCESS <span>→</span>
          </a>
        </section>

        <section className="section courses" id="formations">
          <div className="section-heading">
            <p className="eyebrow">
              <span className="slash" /> LES FORMATIONS
            </p>
            <h2>
              DES MÉTHODES
              <br />
              <span className="red-text">QUE J&apos;APPLIQUE.</span>
            </h2>
            <p>Accès à vie, à ton rythme, pour les formations où c&apos;est indiqué. Achat sur la fiche officielle, questions au secrétariat.</p>
          </div>
          <div className="course-grid">
            {FORMATIONS.map((o) => (
              <OffreCard key={o.tag} o={o} />
            ))}
          </div>
        </section>

        <section className="section" id="llc">
          <div className="section-heading">
            <p className="eyebrow">
              <span className="slash" /> LLC / LTD
            </p>
            <h2>
              TA SOCIÉTÉ À L&apos;ÉTRANGER, <span className="red-bar">SANS BOUGER</span> DE CHEZ TOI.
            </h2>
            <p>Création à distance et accompagnement selon ta situation.</p>
          </div>
          <ul className="kv-points kv-points--row">
            <li>Création possible sans résider aux États-Unis</li>
            <li>Démarches à distance</li>
            <li>Délai indicatif selon la formule</li>
          </ul>
          <div className="kv-plans">
            {LLC.map((p) => (
              <article key={p.f} className={`kv-plan${p.top ? " is-top" : ""}`}>
                {p.top && <span className="kv-badge">LA PLUS CHOISIE</span>}
                <h3>{p.f}</h3>
                <div className="kv-plan-prices">
                  <div>
                    <small>NEW MEXICO</small>
                    <b>{p.nm}</b>
                  </div>
                  <div>
                    <small>WYOMING</small>
                    <b>{p.wy}</b>
                  </div>
                </div>
                <p className="kv-plan-d">Délai indiqué : {p.d}</p>
                <p>{p.c}</p>
                <a className="btn btn-whatsapp btn-compact" href={waOffre(`Bonjour, je souhaite créer une LLC (formule ${p.f.toLowerCase()}).`)} target="_blank" rel="noopener noreferrer">
                  <Wa /> JE CRÉE MA SOCIÉTÉ
                </a>
              </article>
            ))}
          </div>
          <div className="kv-two">
            <div className="kv-box">
              <h3>NEW MEXICO OU WYOMING ?</h3>
              <p>
                <b>New Mexico</b> : confidentialité renforcée et coûts de maintien faibles.
                <br />
                <b>Wyoming</b> : juridiction réputée pour les LLC.
              </p>
              <a className="btn btn-whatsapp btn-whatsapp--outline btn-compact" href={waOffre("Bonjour, j'hésite entre New Mexico et Wyoming pour ma LLC.")} target="_blank" rel="noopener noreferrer">
                <Wa /> TU HÉSITES ? ON T&apos;ORIENTE
              </a>
            </div>
            <div className="kv-box">
              <h3>
                LTD HONG KONG <span className="red-text">SUR DEVIS</span>
              </h3>
              <p>Environ 15 jours. Création, déclarations, comptabilité, adresse professionnelle et accompagnement inclus.</p>
              <a className="btn btn-whatsapp btn-compact" href={waOffre("Bonjour, je souhaite créer une LTD à Hong Kong.")} target="_blank" rel="noopener noreferrer">
                <Wa /> JE CRÉE MA SOCIÉTÉ
              </a>
            </div>
          </div>
          <p className="kv-small">
            Ouverture des comptes selon éligibilité. Document demandé : passeport. Aucune exonération ni économie fiscale garantie :
            tout dépend de ta résidence et de ta situation.
          </p>
        </section>

        <section className="section kv-split" id="snapchat">
          <div className="section-heading">
            <p className="eyebrow">
              <span className="slash" /> COMPTES SNAPCHAT
            </p>
            <h2>
              UNE AUDIENCE <span className="silver-text">DÉJÀ PRÊTE.</span>
            </h2>
            <p>Construire une audience prend du temps. Ici, tu peux démarrer avec des abonnés déjà présents.</p>
          </div>
          <div className="kv-box">
            <ul className="kv-points">
              <li>De quelques milliers à plus de 100 000 abonnés</li>
              <li>Pour une vitrine commerciale, un projet, un compte à thème ou fan</li>
              <li>Prix selon la taille</li>
            </ul>
            <p className="kv-small">Le stock change régulièrement.</p>
            <a className="btn btn-whatsapp" href={waOffre("Bonjour, je voudrais le catalogue, les prix et le fonctionnement des comptes Snapchat.")} target="_blank" rel="noopener noreferrer">
              <Wa /> RECEVOIR LE CATALOGUE ET LES PRIX
            </a>
          </div>
        </section>

        <section className="section kv-split" id="sourcing">
          <div className="section-heading">
            <p className="eyebrow">
              <span className="slash" /> SOURCING
            </p>
            <h2>
              LE BON FOURNISSEUR <span className="red-text">POUR TON BESOIN.</span>
            </h2>
            <p>Tu exprimes ton besoin, on recherche un fournisseur qui y correspond.</p>
          </div>
          <div className="kv-box">
            <p>Pour acheter une formation ou une offre China Access : chinacces.com. Pour être conseillé : le secrétariat sur WhatsApp.</p>
            <div className="kv-btns">
              <a className="btn btn-whatsapp" href={waOffre("Bonjour, je recherche un fournisseur pour un produit.")} target="_blank" rel="noopener noreferrer">
                <Wa /> RECHERCHER UN FOURNISSEUR
              </a>
              <a className="btn btn-silver btn-compact" href="https://chinacces.com" target="_blank" rel="noopener noreferrer">
                CHINACCES.COM <b className="arrow">↗</b>
              </a>
            </div>
          </div>
        </section>

        <section className="section" id="digital">
          <div className="section-heading">
            <p className="eyebrow">
              <span className="slash" /> GRAPHISME & DIGITAL — PARTENAIRE GHOST STUDIO
            </p>
            <h2>
              UNE IMAGE QUI INSPIRE CONFIANCE. <span className="silver-text">DES OUTILS QUI TRAVAILLENT POUR TOI.</span>
            </h2>
            <p>Je travaille avec Ghost Studio, mon studio partenaire : graphisme, identité visuelle, sites web, bots, automatisations, applications et créations sur mesure.</p>
          </div>
          <div className="kv-prices">
            {GHOST_PRIX.map(([n, p]) => (
              <div key={n}>
                <span>{n}</span>
                <b>{p}</b>
              </div>
            ))}
          </div>
          <p className="kv-small">Prix de départ ; les tarifs à jour de ghoststudio.store font foi.</p>
          <div className="kv-btns">
            <a className="btn btn-whatsapp" href={`https://wa.me/${GHOST_WA}`} target="_blank" rel="noopener noreferrer">
              <Wa /> WHATSAPP GHOST STUDIO
            </a>
            <a className="btn btn-brand btn-compact" href="https://ghoststudio.store" target="_blank" rel="noopener noreferrer">
              GHOSTSTUDIO.STORE <span className="arrow">↗</span>
            </a>
            <a className="btn btn-silver btn-compact" href="https://www.snapchat.com/add/GHOST-STUDIO" target="_blank" rel="noopener noreferrer">
              SNAPCHAT GHOST-STUDIO <b className="arrow">↗</b>
            </a>
          </div>
        </section>

        <section className="assistant-section" id="assistant">
          <div className="assistant-copy">
            <p className="eyebrow">
              <span className="pill-white">WHATSAPP</span> ASSISTANT POUR ENTREPRISE
            </p>
            <h2>
              TES MESSAGES
              <br />
              <span className="red-bar">RÉPONDENT</span>
              <br />
              MÊME QUAND TU ES OCCUPÉ.
            </h2>
            <p>Un assistant qui répond automatiquement aux questions qui reviennent souvent, pour les entreprises qui perdent du temps à répondre à la main. Il ne remplace pas tout : il te soulage.</p>
            <a className="btn btn-whatsapp" href={`https://wa.me/33756975687`} target="_blank" rel="noopener noreferrer">
              <Wa /> TESTER SUR WHATSAPP
            </a>
          </div>
          <div className="chat-demo" aria-label="Démonstration d'une conversation WhatsApp">
            <div className="chat-top">
              <span className="chat-dot" />
              <div>
                <strong>SECRÉTARIAT</strong>
                <small>EN LIGNE</small>
              </div>
              <span className="chat-top-icon">•••</span>
            </div>
            <div className="chat-flow">
              <div className="bubble bubble-user">
                Bonjour, je peux avoir des informations sur les formations ?<small>20:45 ✓✓</small>
              </div>
              <div className="typing" aria-label="L'assistant écrit">
                <i />
                <i />
                <i />
              </div>
              <div className="bubble bubble-assistant">
                Bien sûr. Tu veux en savoir plus sur China Access ou Traffic Pro ?<small>20:45</small>
              </div>
            </div>
            <div className="chat-note">DÉMONSTRATION</div>
          </div>
        </section>

        <section className="section kv-split" id="affiliation">
          <div className="section-heading">
            <p className="eyebrow">
              <span className="slash" /> AFFILIATION
            </p>
            <h2>
              RECOMMANDE. <span className="red-text">GAGNE.</span>
            </h2>
          </div>
          <div className="kv-box">
            <p>
              Tu veux recommander les services que je propose ? L&apos;affiliation peut devenir un vrai complément de revenu et, si tu
              t&apos;impliques sérieusement et réalises des ventes, dépasser un salaire.
            </p>
            <p className="kv-small">Les revenus dépendent de ton travail et de tes ventes ; aucun montant n&apos;est garanti.</p>
            <a className="btn btn-whatsapp" href={waOffre("Bonjour, je voudrais devenir affilié.")} target="_blank" rel="noopener noreferrer">
              <Wa /> DEVENIR AFFILIÉ
            </a>
          </div>
        </section>

        <section className="section kv-split" id="qui">
          <div className="section-heading">
            <p className="eyebrow">
              <span className="slash" /> QUI SUIS-JE
            </p>
            <h2>JACOB.</h2>
          </div>
          <div className="kv-box kv-about">
            <p>
              Je suis Jacob, entrepreneur du digital. Depuis des années, je développe des activités autour du marketing, de la vente en
              ligne et de l&apos;e-commerce. J&apos;ai aussi travaillé dans l&apos;import-export en Chine et dans la location de véhicules.
              Je partage ce que j&apos;ai réellement appris et appliqué. Les formations, je les propose aussi par plaisir, pour transmettre
              mon expérience et les bons outils.
            </p>
          </div>
        </section>

        <section className="section" id="rdv">
          <div className="section-heading">
            <p className="eyebrow">
              <span className="slash" /> RÉSERVER UN APPEL
            </p>
            <h2>
              ON EN PARLE <span className="red-bar">EN DIRECT.</span>
            </h2>
            <p>Appel WhatsApp informatif de 15 minutes gratuit, ou appel d&apos;une heure à 25 €.</p>
          </div>
          <BookingForm avail={avail} />
        </section>

        <section className="contact-strip" id="contact">
          <div>
            <p className="eyebrow">UNE QUESTION AVANT DE TE LANCER ?</p>
            <h2>ON EN PARLE SUR WHATSAPP.</h2>
            <p className="kv-small">Secrétariat : +33 7 56 97 56 87</p>
          </div>
          <a className="btn btn-whatsapp" href={WA_GENERAL} target="_blank" rel="noopener noreferrer">
            <Wa /> ÉCRIRE AU SECRÉTARIAT
          </a>
        </section>

        <Faq />
      </main>

      <a className="floating-wa" href={WA_GENERAL} target="_blank" rel="noopener noreferrer" aria-label="Écrire au secrétariat sur WhatsApp">
        <Wa />
        <span>WHATSAPP</span>
      </a>
      <footer>
        <span>© ARBI JACOB</span>
        <span>
          <Link href="/apercu/conditions">CONDITIONS GÉNÉRALES</Link> · <Link href="/apercu/confidentialite">CONFIDENTIALITÉ</Link>
        </span>
      </footer>
    </>
  );
}
