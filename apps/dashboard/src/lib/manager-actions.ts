"use server";

import { knowledgeRejectReason, logDecision } from "@arbi/core";
import { revalidatePath } from "next/cache";
import { requireSession } from "./auth";
import { getRuntime } from "./core";

/**
 * Actions du Manager IA (section « Apprentissage IA »). Fichier séparé de
 * actions.ts : le Manager IA est additif, rien d'existant n'est modifié.
 */

const clip = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

export async function updateKnowledgeAction(id: number, formData: FormData): Promise<void> {
  await requireSession();
  const { core, log } = getRuntime();
  const patch = {
    sujet: clip(formData.get("sujet"), 80),
    theme: clip(formData.get("theme"), 60),
    intention: clip(formData.get("intention"), 300),
    reponse: clip(formData.get("reponse"), 1200),
    conditions: clip(formData.get("conditions"), 600),
    exceptions: clip(formData.get("exceptions"), 600),
  };
  if (!patch.intention || !patch.reponse) return;
  // Même filtre que l'apprentissage automatique : une connaissance est partagée entre tous les clients.
  if (knowledgeRejectReason([patch.reponse, patch.conditions, patch.exceptions])) return;
  core.knowledge.entries.update(id, patch, { action: "edition_admin", source: "admin", raison: "modification manuelle (back-office)" });
  logDecision(log, "knowledge_edited", { id });
  revalidatePath("/admin/manager-ia");
}

export async function deleteKnowledgeAction(id: number): Promise<void> {
  await requireSession();
  const { core, log } = getRuntime();
  core.knowledge.entries.remove(id, "admin", "supprimée depuis le back-office");
  logDecision(log, "knowledge_deleted", { id });
  revalidatePath("/admin/manager-ia");
}

export async function cancelEscalationAction(id: number): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  core.knowledge.escalations.cancel(id);
  revalidatePath("/admin/manager-ia");
}

export async function saveManagerSettingsAction(formData: FormData): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  core.settings.set("manager_ia_actif", formData.get("manager_ia_actif") === "on");
  const haut = Number(String(formData.get("seuil_haut") ?? "").replace(",", ".")) / 100;
  const bas = Number(String(formData.get("seuil_bas") ?? "").replace(",", ".")) / 100;
  if (Number.isFinite(haut) && Number.isFinite(bas)) {
    const h = Math.min(0.95, Math.max(0.3, haut));
    const b = Math.min(h - 0.05, Math.max(0.1, bas));
    core.settings.set("confiance_seuil_haut", Math.round(h * 100) / 100);
    core.settings.set("confiance_seuil_bas", Math.round(b * 100) / 100);
  }
  revalidatePath("/admin/manager-ia");
}
