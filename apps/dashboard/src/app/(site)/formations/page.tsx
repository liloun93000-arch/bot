import type { Metadata } from "next";
import { FORMATIONS } from "../_v/data";
import { Faq, FormationCard, PageHead } from "../_v/ui";

export const metadata: Metadata = { title: "Formations" };

export default function Formations() {
  return (
    <>
      <PageHead kicker="Formations" titre="Des méthodes que j'applique moi-même." sous="Accès à vie, à ton rythme." />
      <section className="cv-section">
        <div className="cv-wrap cv-grid-offers">
          {FORMATIONS.map((f) => (
            <FormationCard key={f.titre} f={f} />
          ))}
        </div>
      </section>
      <Faq />
    </>
  );
}
