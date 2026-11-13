import { QuiSection } from "../sections";
import { Back } from "../ui";
import { JsonLd, SITE, breadcrumbLd, pageMeta, serviceLd } from "../seo";

export function generateMetadata() {
  return pageMeta("/a-propos", 'Qui est Jacob ? Entrepreneur digital, import-export et e-commerce | ARBI JACOB', "Jacob, entrepreneur du digital, de l'import-export et du e-commerce, formateur China Access : son parcours et sa méthode.");
}

export default function Page() {
  void SITE;
  void serviceLd;
  return (
    <>
      <JsonLd data={{"@context":"https://schema.org","@type":"AboutPage","name":"Qui est Jacob ?","url":`${SITE}/a-propos`}} />
      <JsonLd data={breadcrumbLd([['À propos', "/a-propos"]])} />
      <h1 className="sr-only">QUI EST JACOB ?</h1>
      <Back />
      <QuiSection />
    </>
  );
}
