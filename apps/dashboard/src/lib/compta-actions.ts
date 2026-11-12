"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "./auth";
import { getRuntime } from "./core";
import { ajouterEcriture, supprimerEcriture } from "./compta";
import { parisMidnight } from "./period";

const txt = (v: FormDataEntryValue | null, n = 120): string => String(v ?? "").trim().slice(0, n);

export async function ajouterEcritureAction(formData: FormData): Promise<void> {
  await requireSession();
  const sens = txt(formData.get("sens")) === "sortie" ? "sortie" : "entree";
  const montant = Number(txt(formData.get("montant")).replace(/\s|€/g, "").replace(",", "."));
  const back = (m: string) => redirect(`/admin/compta?${new URLSearchParams({ msg: m, sens }).toString()}#saisie`);
  if (!Number.isFinite(montant) || montant <= 0) back("⚠️ Montant invalide (ex. 600 ou 49,90).");
  const date = txt(formData.get("date"));
  // Midi heure de Paris : la saisie tombe toujours sur le bon jour.
  const dateTs = /^\d{4}-\d{2}-\d{2}$/.test(date) ? parisMidnight(date) + 12 * 3_600_000 : Date.now();
  ajouterEcriture(getRuntime().core, {
    sens,
    montantCents: Math.round(montant * 100),
    categorie: txt(formData.get("categorie"), 40) || (sens === "entree" ? "Autre vente" : "Autre dépense"),
    libelle: txt(formData.get("libelle")),
    client: txt(formData.get("client"), 60),
    moyen: txt(formData.get("moyen"), 20),
    dateTs,
  });
  revalidatePath("/admin/compta");
  back(sens === "entree" ? "✅ Vente enregistrée." : "✅ Dépense enregistrée.");
}

export async function supprimerEcritureAction(id: number): Promise<void> {
  await requireSession();
  supprimerEcriture(getRuntime().core, id);
  revalidatePath("/admin/compta");
  redirect("/admin/compta?msg=" + encodeURIComponent("Ligne supprimée."));
}
