import type { Metadata } from "next";
import { headers } from "next/headers";
import { FAQ, FORMATIONS, type Offre } from "../data";
import { slugOf } from "./ui";

export const SITE = process.env.SITE_URL || "https://www.arbijacob.com";

/** Métadonnées SEO d'une page : titre, description, adresse canonique, aperçu de partage adapté à l'appli. */
export async function pageMeta(path: string, title: string, description: string, opts: { noindex?: boolean } = {}): Promise<Metadata> {
  const ua = (await headers()).get("user-agent") ?? "";
  const carre = /snapchat|snap\b|snapbot/i.test(ua);
  const image = carre
    ? { url: "/og/og-carre.jpg", width: 600, height: 600, alt: "ARBI JACOB" }
    : { url: "/og/og-arbijacob.jpg", width: 1200, height: 630, alt: "ARBI JACOB — Ton business commence ici." };
  return {
    metadataBase: new URL(SITE),
    title,
    description,
    alternates: { canonical: path },
    robots: opts.noindex ? { index: false, follow: true } : { index: true, follow: true, "max-image-preview": "large" },
    openGraph: { type: "website", siteName: "ARBI JACOB", title, description, url: path, locale: "fr_FR", images: [image] },
    twitter: { card: carre ? "summary" : "summary_large_image", title, description, images: [image.url] },
  };
}

/** Données structurées (schema.org) lues par Google. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

const prixNum = (p: string): number | undefined => {
  const m = /(\d[\d\s ]*)/.exec(p.replace(/\./g, ""));
  return m ? Number(m[1]!.replace(/\D/g, "")) : undefined;
};

export const ORGANISATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE}/#organisation`,
  name: "ARBI JACOB",
  url: SITE,
  logo: `${SITE}/og/og-carre.jpg`,
  description: "Formations business, création de société (LLC USA, LTD Hong Kong), sourcing de fournisseurs en Chine et services digitaux.",
  areaServed: ["FR", "BE", "CH", "CA"],
  knowsLanguage: ["fr"],
  contactPoint: [{ "@type": "ContactPoint", contactType: "customer service", telephone: "+33756975687", availableLanguage: ["French"] }],
};

export const WEBSITE = { "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITE}/#site`, name: "ARBI JACOB", url: SITE, inLanguage: "fr-FR", publisher: { "@id": `${SITE}/#organisation` } };

export const FAQ_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(([q, r]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: r } })),
};

export function courseLd(o: Offre) {
  const prix = prixNum(o.prix);
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: o.titre.filter(Boolean).join(" "),
    description: o.accroche,
    url: `${SITE}/formations/${slugOf(o)}`,
    inLanguage: "fr",
    provider: { "@id": `${SITE}/#organisation` },
    ...(prix ? { offers: { "@type": "Offer", price: prix, priceCurrency: "EUR", category: "Paid", availability: "https://schema.org/InStock", url: `${SITE}/formations/${slugOf(o)}` } } : {}),
    hasCourseInstance: { "@type": "CourseInstance", courseMode: "Online", courseWorkload: "PT10H" },
  };
}

export const FORMATIONS_LD = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  itemListElement: FORMATIONS.map((o, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/formations/${slugOf(o)}`, name: o.titre.filter(Boolean).join(" ") })),
};

export function serviceLd(name: string, path: string, description: string, price?: number) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    url: `${SITE}${path}`,
    provider: { "@id": `${SITE}/#organisation` },
    areaServed: "FR",
    ...(price ? { offers: { "@type": "Offer", price, priceCurrency: "EUR" } } : {}),
  };
}

export function breadcrumbLd(items: Array<[string, string]>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [["Accueil", "/"] as [string, string], ...items].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${SITE}${path === "/" ? "" : path}` })),
  };
}

