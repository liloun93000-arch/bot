import type { MetadataRoute } from "next";
import { siteBaseUrl } from "@/lib/site/server";

export const dynamic = "force-dynamic";

/** Sitemap du site vitrine (une page + pages légales). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteBaseUrl();
  const now = new Date();
  return [
    { url: new URL("/", base).toString(), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: new URL("/conditions", base).toString(), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: new URL("/confidentialite", base).toString(), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
