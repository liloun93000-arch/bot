import { AffiliationSection } from "../sections";
import { Back } from "../ui";
import { JsonLd, SITE, breadcrumbLd, pageMeta, serviceLd } from "../seo";

export function generateMetadata() {
  return pageMeta("/affiliation", "Affiliation China Access : gagne de l'argent en recommandant | ARBI JACOB", 'Deviens affilié : recommande les formations et services China Access et ARBI JACOB, et touche une commission sur chaque vente.');
}

export default function Page() {
  void SITE;
  void serviceLd;
  return (
    <>
      <JsonLd data={serviceLd("Programme d'affiliation", "/affiliation", "Commission sur chaque vente des formations et services recommandés.")} />
      <JsonLd data={breadcrumbLd([['Affiliation', "/affiliation"]])} />
      <h1 className="sr-only">PROGRAMME D&apos;AFFILIATION</h1>
      <Back />
      <AffiliationSection />
    </>
  );
}
