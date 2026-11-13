import { SourcingSection } from "../sections";
import { Back } from "../ui";
import { JsonLd, SITE, breadcrumbLd, pageMeta, serviceLd } from "../seo";

export function generateMetadata() {
  return pageMeta("/sourcing", 'Sourcing en Chine : trouver le bon fournisseur | ARBI JACOB', "On trouve pour toi le bon fournisseur en Chine : recherche produit, comparaison d'usines, négociation et accompagnement import-export.");
}

export default function Page() {
  void SITE;
  void serviceLd;
  return (
    <>
      <JsonLd data={serviceLd("Sourcing de fournisseurs en Chine", "/sourcing", "Recherche de produits et de fournisseurs en Chine, comparaison et accompagnement import-export.")} />
      <JsonLd data={breadcrumbLd([['Sourcing', "/sourcing"]])} />
      <h1 className="sr-only">SOURCING : TROUVER LE BON FOURNISSEUR EN CHINE</h1>
      <Back />
      <SourcingSection />
    </>
  );
}
