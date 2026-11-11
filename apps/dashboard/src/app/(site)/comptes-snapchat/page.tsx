import type { Metadata } from "next";
import { Faq, PageHead, WaButton } from "../_v/ui";

export const metadata: Metadata = { title: "Comptes Snapchat" };

export default function Snapchat() {
  return (
    <>
      <PageHead
        kicker="Comptes Snapchat"
        titre="Une audience déjà prête."
        sous="Construire une audience prend des mois. Ici, tu démarres avec des abonnés déjà là."
      />
      <section className="cv-section">
        <div className="cv-wrap">
          <article className="cv-card cv-offer">
            <ul className="cv-points">
              <li>De quelques milliers à plus de 100 000 abonnés</li>
              <li>Idéal pour une vitrine commerciale, un lancement de projet, un compte à thème ou un compte fan</li>
              <li>Prix selon la taille de l&apos;audience</li>
            </ul>
            <p className="cv-encart">Le stock change tous les jours.</p>
            <WaButton message="Bonjour Jacob, je voudrais voir les comptes Snapchat disponibles.">Voir les comptes disponibles</WaButton>
          </article>
        </div>
      </section>
      <Faq />
    </>
  );
}
