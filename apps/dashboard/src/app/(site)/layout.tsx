import type { Metadata } from "next";
import { Footer, FloatingWa, Header } from "./_v/ui";
import "./vitrine.css";

export const metadata: Metadata = {
  title: { default: "Jacob — Lance ton business. On s'occupe du reste.", template: "%s — Jacob" },
  description:
    "Formations, création de société, comptes Snapchat et services digitaux. Une seule personne à contacter, une réponse rapide sur WhatsApp.",
};

const NO_JS_SCRIPT = "document.documentElement.classList.remove('no-js')";

export default function VitrineLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="cv-root">
      <script dangerouslySetInnerHTML={{ __html: NO_JS_SCRIPT }} />
      <Header />
      <main>{children}</main>
      <Footer />
      <FloatingWa />
    </div>
  );
}
