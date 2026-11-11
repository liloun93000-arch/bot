import type { Metadata } from "next";
import { LLC } from "../_v/data";
import { Faq, PageHead, WaButton } from "../_v/ui";

export const metadata: Metadata = { title: "Création de LLC / LTD" };

export default function Llc() {
  return (
    <>
      <PageHead
        kicker="Création de LLC / LTD"
        titre="Ta société à l'étranger, sans bouger de chez toi."
        sous="Anonyme • Sécurisée • Optimisée. Idéale pour encaisser sans les limites d'un compte personnel."
      />
      <section className="cv-section">
        <div className="cv-wrap">
          <ul className="cv-checks">
            <li>Création possible même si tu ne résides pas aux États-Unis</li>
            <li>Tout se fait à distance</li>
            <li>De 7 à 15 jours selon la formule</li>
          </ul>

          <div className="cv-plans">
            {LLC.map((p) => (
              <article key={p.formule} className={`cv-card cv-plan${p.top ? " is-top" : ""}`}>
                {p.top && <span className="cv-badge">⭐ La plus choisie</span>}
                <h3>{p.formule}</h3>
                <div className="cv-plan-prices">
                  <div>
                    <small>New Mexico</small>
                    <b>{p.nm}</b>
                  </div>
                  <div>
                    <small>Wyoming</small>
                    <b>{p.wy}</b>
                  </div>
                </div>
                <p className="cv-plan-delai">Délai : {p.delai}</p>
                <p className="cv-plan-cont">{p.contenu}</p>
                <WaButton message={`Bonjour Jacob, je suis intéressé par la création de LLC (formule ${p.formule}).`}>
                  Je crée ma société
                </WaButton>
              </article>
            ))}
          </div>

          <div className="cv-card cv-compare">
            <h3>New Mexico ou Wyoming ?</h3>
            <ul className="cv-points">
              <li>
                <b>New Mexico</b> : confidentialité renforcée, coûts de maintien faibles
              </li>
              <li>
                <b>Wyoming</b> : la juridiction la plus réputée pour les LLC
              </li>
            </ul>
            <p>Tu hésites ? Écris-nous, on t&apos;oriente.</p>
            <WaButton message="Bonjour Jacob, j'hésite entre New Mexico et Wyoming pour ma LLC.">On t&apos;oriente</WaButton>
          </div>

          <article className="cv-card cv-offer">
            <div className="cv-offer-top">
              <h3>LTD Hong Kong</h3>
              <span className="cv-price">1 500 €</span>
            </div>
            <p className="cv-offer-acc">Environ 15 jours.</p>
            <ul className="cv-points">
              <li>Création, déclarations, comptabilité</li>
              <li>Adresse professionnelle</li>
              <li>Accompagnement inclus</li>
            </ul>
            <WaButton message="Bonjour Jacob, je suis intéressé par la création d'une LTD à Hong Kong.">Je crée ma société</WaButton>
          </article>

          <p className="cv-small">Ouverture des comptes selon éligibilité. Document demandé : passeport.</p>
        </div>
      </section>
      <Faq />
    </>
  );
}
