"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "./auth";
import { getRuntime } from "./core";
import { PRIX_DEFAUT, saisirSolde } from "./api-balance";

const num = (v: FormDataEntryValue | null): number => Number(String(v ?? "").replace(/\s|\$/g, "").replace(",", "."));

export async function saisirSoldeAction(formData: FormData): Promise<void> {
  await requireSession();
  const solde = num(formData.get("solde"));
  const pe = num(formData.get("prix_entree"));
  const ps = num(formData.get("prix_sortie"));
  if (!Number.isFinite(solde) || solde < 0) redirect("/admin/conso?msg=" + encodeURIComponent("⚠️ Solde invalide (ex. 21,12)."));
  saisirSolde(getRuntime().core, {
    soldeUsd: solde,
    prixEntree: Number.isFinite(pe) && pe > 0 ? pe : PRIX_DEFAUT.entree,
    prixSortie: Number.isFinite(ps) && ps > 0 ? ps : PRIX_DEFAUT.sortie,
    createdAt: Date.now(),
  });
  revalidatePath("/admin/conso");
  redirect("/admin/conso?msg=" + encodeURIComponent("✅ Solde enregistré. Le suivi repart de maintenant."));
}
