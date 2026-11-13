import type { MetadataRoute } from "next";
import { siteBaseUrl } from "@/lib/site/server";
import { FORMATIONS } from "./(vitrine)/data";
import { slugOf } from "./(vitrine)/(v2)/ui";

export const dynamic = "force-dynamic";

/** Sitemap du site vitrine (une page + pages légales). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteBaseUrl();
  const now = new Date();
  return [
    { url: new URL("/", base).toString(), lastModified: now, changeFrequency: "weekly", priority: 1 },
    // Pages mises en avant (liens annexes souhaités) : Formations, Création de société, Mon compte.
    ...["/formations", "/societe", "/compte"].map((p) => ({
      url: new URL(p, base).toString(),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    ...["/sourcing", "/ghost-studio", "/snapchat", "/affiliation", "/assistant", "/a-propos"].map((p) => ({
      url: new URL(p, base).toString(),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...FORMATIONS.map((o) => ({
      url: new URL(`/formations/${slugOf(o)}`, base).toString(),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    { url: new URL("/conditions", base).toString(), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: new URL("/confidentialite", base).toString(), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
