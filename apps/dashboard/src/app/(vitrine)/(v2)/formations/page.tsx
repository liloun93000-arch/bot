import { FORMATIONS } from "../../data";
import { FormationCard, PageTop } from "../ui";
import { FORMATIONS_LD, JsonLd, breadcrumbLd, pageMeta } from "../seo";

export function generateMetadata() {
  return pageMeta("/formations", "Formations business en ligne : import Chine, audience, achat-revente | ARBI JACOB", "Toutes les formations : China Access (import-export et fournisseurs), Traffic Pro, Vinted Pro, Shopper Pro et location de véhicules allemands. Prix, programme et accès.");
}

export default function Formations() {
  return (
    <section className="section">
      <JsonLd data={FORMATIONS_LD} />
      <JsonLd data={breadcrumbLd([["Formations", "/formations"]])} />
      <PageTop eyebrow="FORMATIONS" titre={<>APPRENDS CE QUI <span className="red-text">MARCHE VRAIMENT.</span></>} intro="Touche une formation pour voir le programme, le prix et le paiement." />
      <div className="v2-fgrid">
        {FORMATIONS.map((o) => (
          <FormationCard key={o.tag} o={o} />
        ))}
      </div>
    </section>
  );
}
