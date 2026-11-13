/* eslint-disable @next/next/no-img-element */
/** Sections détaillées de la Preview V2, utilisées sur les pages dédiées. */
import { GHOST_PRIX, GHOST_WA, LLC, waOffre } from "../data";
import { Wa } from "../wa-icon";

export function LlcSection() {
  return (
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
  );
}

export function SnapchatSection() {
  return (
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
  );
}

export function SourcingSection() {
  return (
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
  );
}

export function DigitalSection() {
  return (
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
  );
}

export function AssistantSection() {
  return (
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
            <a className="btn btn-whatsapp" href="/go/site" target="_blank" rel="noopener noreferrer">
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
  );
}

export function AffiliationSection() {
  return (
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
  );
}

export function QuiSection() {
  return (
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
  );
}
