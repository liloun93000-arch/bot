"use server";

import { getRuntime } from "@/lib/core";
import { book, CALL_LABEL, type CallType } from "@/lib/bookings";

export type BookState = { ok: boolean; message: string; payer?: string } | null;

export async function bookCallAction(_prev: BookState, formData: FormData): Promise<BookState> {
  const type = (String(formData.get("type")) === "1h" ? "1h" : "15min") as CallType;
  const date = String(formData.get("date") ?? "");
  const heure = String(formData.get("heure") ?? "");
  const r = book(getRuntime().core, {
    type,
    date,
    heure,
    nom: String(formData.get("nom") ?? ""),
    numero: String(formData.get("numero") ?? ""),
    sujet: String(formData.get("sujet") ?? ""),
  });
  if (!r.ok) return { ok: false, message: r.error };
  const [y, m, d] = date.split("-");
  return {
    ok: true,
    message: `${CALL_LABEL[type]} le ${d}/${m}/${y} à ${heure} (heure de Paris). Le secrétariat te confirme sur WhatsApp.`,
    payer:
      type === "1h"
        ? `https://wa.me/33756975687?text=${encodeURIComponent(`Bonjour, j'ai réservé un appel d'1 h le ${d}/${m}/${y} à ${heure}. Je souhaite payer.`)}`
        : undefined,
  };
}
