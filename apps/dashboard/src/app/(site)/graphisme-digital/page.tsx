import type { Metadata } from "next";
import { GHOST } from "../_v/data";
import { Faq, PageHead, WaIcon } from "../_v/ui";

export const metadata: Metadata = { title: "Graphisme & digital" };

const BLOCS = [
  { t: "Graphisme", d: "Logo 50 €, flyer 70 €, filtre Snapchat / Instagram 50 €. Affiches, visuels et menu boards sur devis." },
  { t: "Identité visuelle", d: "Brand Starter dès 750 €, Brand Launch dès 1 500 €, Brand Premium dès 3 000 €." },
  { t: "Sites web", d: "Site vitrine dès 750 €, vitrine premium dès 1 500 €, e-commerce dès 750 €, e-commerce avancé dès 2 500 €." },
  {
    t: "Bots & automatisations",
    s: "Arrête de répondre aux mêmes questions toute la journée.",
    d: "Réponses automatiques, relances, suivi client, rendez-vous. Automatisation dès 750 €, bot WhatsApp dès 1 500 €, bot Telegram ou Discord dès 1 000 €, agent IA dès 2 500 €.",
  },
  { t: "Applications", d: "Application web dès 3 000 €, application mobile dès 5 000 €, dashboard dès 1 500 €, CRM / ERP dès 1 500 €." },
  { t: "Création", d: "Vidéos animées et 3D, mascottes, plaques NFC Instagram / Snapchat, sur devis." },
];

export default function Digital() {
  return (
    <>
      <PageHead
        kicker="Graphisme & digital — partenaire Ghost Studio"
        titre="Une image qui inspire confiance, des outils qui travaillent pour toi."
        sous="Nous travaillons avec Ghost Studio, notre studio partenaire. Le bot WhatsApp qui te répond, c'est leur travail."
      />
      <section className="cv-section">
        <div className="cv-wrap cv-grid-offers">
          {BLOCS.map((b) => (
            <article key={b.t} className="cv-card cv-offer">
              <h3>{b.t}</h3>
              {b.s && <p className="cv-offer-acc">« {b.s} »</p>}
              <p className="cv-offer-txt">{b.d}</p>
            </article>
          ))}
        </div>
        <div className="cv-wrap">
          <p className="cv-small">Prix de départ, devis selon ton projet.</p>
          <div className="cv-ghost">
            <a className="cv-btn cv-btn-wa" href={GHOST.whatsapp} target="_blank" rel="noopener noreferrer">
              <WaIcon /> WhatsApp Ghost Studio · {GHOST.whatsappDisplay}
            </a>
            <a className="cv-btn cv-btn-ghost" href={GHOST.site} target="_blank" rel="noopener noreferrer">
              🌐 ghoststudio.store
            </a>
            <a className="cv-btn cv-btn-ghost" href={GHOST.snapchat} target="_blank" rel="noopener noreferrer">
              👻 Snapchat : GHOST-STUDIO
            </a>
          </div>
        </div>
      </section>
      <Faq />
    </>
  );
}
