import { DigitalSection } from "../sections";
import { Back } from "../ui";
import { JsonLd, SITE, breadcrumbLd, pageMeta, serviceLd } from "../seo";

export function generateMetadata() {
  return pageMeta("/ghost-studio", 'Ghost Studio : logo, flyers, site internet, Shopify et bots | ARBI JACOB', 'Graphisme, identité visuelle, flyers, motion, sites vitrines, boutiques Shopify et bots WhatsApp avec notre partenaire Ghost Studio.');
}

export default function Page() {
  void SITE;
  void serviceLd;
  return (
    <>
      <JsonLd data={serviceLd("Graphisme et création de sites (Ghost Studio)", "/ghost-studio", "Logos, flyers, motion design, sites vitrines, boutiques Shopify et bots WhatsApp.", 40)} />
      <JsonLd data={breadcrumbLd([['Ghost Studio', "/ghost-studio"]])} />
      <h1 className="sr-only">GHOST STUDIO : GRAPHISME, SITES ET OUTILS DIGITAUX</h1>
      <Back />
      <DigitalSection />
    </>
  );
}
