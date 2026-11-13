import { LlcSection } from "../sections";
import { Back } from "../ui";
import { JsonLd, SITE, breadcrumbLd, pageMeta, serviceLd } from "../seo";

export function generateMetadata() {
  return pageMeta("/societe", 'Créer une société : LLC USA (New Mexico, Wyoming) et LTD Hong Kong | ARBI JACOB', 'Crée ta LLC aux USA (New Mexico ou Wyoming) ou ta LTD à Hong Kong, à distance, dès 545 €. Formules Basique, Prestige et Ultime, EIN et accompagnement bancaire.');
}

export default function Page() {
  void SITE;
  void serviceLd;
  return (
    <>
      <JsonLd data={serviceLd("Création de société LLC USA et LTD Hong Kong", "/societe", "Création de LLC (New Mexico, Wyoming) et de LTD à Hong Kong, à distance, avec accompagnement.", 545)} />
      <JsonLd data={breadcrumbLd([['Créer une société', "/societe"]])} />
      <h1 className="sr-only">CRÉER SA SOCIÉTÉ : LLC USA ET LTD HONG KONG</h1>
      <Back />
      <LlcSection />
    </>
  );
}
