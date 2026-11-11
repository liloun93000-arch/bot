import type { MetadataRoute } from "next";
import { siteBaseUrl } from "@/lib/site/server";
import { NAV } from "./(site)/_v/data";

export const dynamic = "force-dynamic";

/** Sitemap du site vitrine de Jacob. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteBaseUrl();
  const now = new Date();
  return NAV.map((n) => ({
    url: new URL(n.href, base).toString(),
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: n.href === "/" ? 1 : 0.8,
  }));
}
