import type { Metadata } from "next";
import { WA_DISPLAY } from "../_v/data";
import { Faq, PageHead, WaButton } from "../_v/ui";

export const metadata: Metadata = { title: "Contact" };

export default function Contact() {
  return (
    <>
      <PageHead kicker="Contact" titre="Écris-moi sur WhatsApp." sous="Réponse rapide, 7 jours sur 7." />
      <section className="cv-section">
        <div className="cv-wrap">
          <div className="cv-card cv-about">
            <p className="cv-contact-num">{WA_DISPLAY}</p>
            <WaButton big message="Bonjour Jacob, je viens de ton site.">
              Ouvrir WhatsApp
            </WaButton>
          </div>
        </div>
      </section>
      <Faq />
    </>
  );
}
