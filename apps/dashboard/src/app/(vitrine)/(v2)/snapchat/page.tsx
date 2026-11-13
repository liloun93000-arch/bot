import { SnapchatSection } from "../sections";
import { Back } from "../ui";
import { JsonLd, SITE, breadcrumbLd, pageMeta, serviceLd } from "../seo";

export function generateMetadata() {
  return pageMeta("/snapchat", 'Comptes Snapchat avec abonnés pour vendre et communiquer | ARBI JACOB', "Comptes Snapchat prêts à l'emploi avec abonnés, pour lancer ta communication et vendre plus vite. Disponibilités et prix sur WhatsApp.");
}

export default function Page() {
  void SITE;
  void serviceLd;
  return (
    <>
      <JsonLd data={serviceLd("Comptes Snapchat avec abonnés", "/snapchat", "Comptes Snapchat prêts à l'emploi pour communiquer et vendre.")} />
      <JsonLd data={breadcrumbLd([['Comptes Snapchat', "/snapchat"]])} />
      <h1 className="sr-only">COMPTES SNAPCHAT AVEC ABONNÉS</h1>
      <Back />
      <SnapchatSection />
    </>
  );
}
