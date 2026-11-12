import { FORMATIONS } from "../../data";
import { FormationCard, PageTop } from "../ui";

export default function Formations() {
  return (
    <section className="section">
      <PageTop eyebrow="FORMATIONS" titre={<>APPRENDS CE QUI <span className="red-text">MARCHE VRAIMENT.</span></>} intro="Touche une formation pour voir le programme, le prix et le paiement." />
      <div className="v2-fgrid">
        {FORMATIONS.map((o) => (
          <FormationCard key={o.tag} o={o} />
        ))}
      </div>
    </section>
  );
}
