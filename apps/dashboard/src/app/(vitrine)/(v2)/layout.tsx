import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Header, FloatingWa, BASE } from "./ui";
import { Reveal } from "./reveal";
import "./v2.css";

const SITE = process.env.SITE_URL || "https://www.arbijacob.com";
const TITRE = "ARBI JACOB — Formations, société, sourcing et digital";
const DESC = "Formations, création de société, sourcing en Chine et services digitaux. Une seule personne à contacter.";

/**
 * Aperçu quand on partage le lien. Les applis qui n'affichent qu'un petit CARRÉ (Snapchat…) reçoivent
 * le logo AJ seul ; les autres (WhatsApp, Instagram, Messenger, X, Telegram…) la grande image 1200 × 630.
 */
export async function generateMetadata(): Promise<Metadata> {
  const ua = (await headers()).get("user-agent") ?? "";
  const carre = /snapchat|snap\b|snapbot/i.test(ua);
  const image = carre
    ? { url: "/og/og-carre.jpg", width: 600, height: 600, alt: "ARBI JACOB" }
    : { url: "/og/og-arbijacob.jpg", width: 1200, height: 630, alt: "ARBI JACOB — Ton business commence ici." };
  return {
    metadataBase: new URL(SITE),
    title: TITRE,
    description: DESC,
    openGraph: { type: "website", siteName: "ARBI JACOB", title: TITRE, description: DESC, url: "/", locale: "fr_FR", images: [image] },
    twitter: { card: carre ? "summary" : "summary_large_image", title: TITRE, description: DESC, images: [image.url] },
  };
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="v2">
      <Reveal />
      <Header />
      <main className="v2-main">
        {children}
      </main>
      <footer className="v2-foot">
        <span>© ARBI JACOB</span>
        <span>
          <Link href="/">ACCUEIL</Link> · <Link href="/formations">FORMATIONS</Link> · <Link href="/societe">CRÉATION DE SOCIÉTÉ</Link> ·{" "}
          <Link href="/compte">MON COMPTE</Link> · <Link href={`${BASE}/a-propos`}>À PROPOS</Link> · <Link href="/conditions">CONDITIONS</Link> ·{" "}
          <Link href="/confidentialite">CONFIDENTIALITÉ</Link>
        </span>
      </footer>
      <FloatingWa />
    </div>
  );
}
