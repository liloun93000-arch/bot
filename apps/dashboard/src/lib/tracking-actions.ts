"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "./auth";
import { getRuntime } from "./core";
import { ensureTracking, slugify } from "./tracking";

export async function addSourceAction(formData: FormData): Promise<void> {
  await requireSession();
  const nom = String(formData.get("nom") ?? "").trim().slice(0, 40);
  const slug = slugify(String(formData.get("slug") ?? "") || nom);
  if (!nom || !slug) redirect("/admin/sources?msg=" + encodeURIComponent("⚠️ Donne un nom à la source."));
  const { core } = getRuntime();
  ensureTracking(core);
  const r = core.sqlite
    .prepare(`INSERT OR IGNORE INTO tracking_sources (slug, nom, actif, created_at) VALUES (?, ?, 1, ?)`)
    .run(slug, nom, Date.now()) as { changes: number };
  revalidatePath("/admin/sources");
  redirect(
    "/admin/sources?msg=" +
      encodeURIComponent(r.changes ? `✅ Source « ${nom} » ajoutée.` : `⚠️ Le lien /go/${slug} existe déjà.`),
  );
}

export async function toggleSourceAction(id: number): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  ensureTracking(core);
  core.sqlite.prepare(`UPDATE tracking_sources SET actif = 1 - actif WHERE id = ?`).run(id);
  revalidatePath("/admin/sources");
  revalidatePath("/admin");
}
