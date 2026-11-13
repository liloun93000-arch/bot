import { AssistantSection } from "../sections";
import { Back } from "../ui";
import { JsonLd, SITE, breadcrumbLd, pageMeta, serviceLd } from "../seo";

export function generateMetadata() {
  return pageMeta("/assistant", 'Assistant WhatsApp automatique pour ton business | ARBI JACOB', 'Un assistant WhatsApp qui répond à tes clients 24 h/24, donne tes prix et te prévient quand il faut reprendre la main.');
}

export default function Page() {
  void SITE;
  void serviceLd;
  return (
    <>
      <JsonLd data={serviceLd("Assistant WhatsApp automatique", "/assistant", "Assistant WhatsApp qui répond aux clients, donne les prix et alerte quand il faut reprendre la main.")} />
      <JsonLd data={breadcrumbLd([['Assistant WhatsApp', "/assistant"]])} />
      <h1 className="sr-only">ASSISTANT WHATSAPP POUR TON BUSINESS</h1>
      <Back />
      <AssistantSection />
    </>
  );
}
