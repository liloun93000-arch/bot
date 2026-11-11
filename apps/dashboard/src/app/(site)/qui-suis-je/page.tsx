import type { Metadata } from "next";
import { Faq, PageHead, WaButton } from "../_v/ui";

export const metadata: Metadata = { title: "Qui suis-je" };

export default function QuiSuisJe() {
  return (
    <>
      <PageHead kicker="Qui suis-je" titre="Je suis Jacob." />
      <section className="cv-section">
        <div className="cv-wrap">
          <div className="cv-card cv-about">
            <p>
              Je suis Jacob, formateur officiel de China Access. Je n&apos;enseigne que ce que j&apos;applique moi-même : la
              location de véhicules, la création de trafic, l&apos;achat-revente, les sociétés à l&apos;étranger. Mon objectif est
              simple : que tu avances vite, avec les bons outils et les bons contacts.
            </p>
            <WaButton message="Bonjour Jacob, je viens de ton site.">Me contacter</WaButton>
          </div>
        </div>
      </section>
      <Faq />
    </>
  );
}
