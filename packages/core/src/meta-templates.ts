/**
 * Templates WhatsApp côté Meta : retrouver le compte WhatsApp Business (WABA), lister les templates, et
 * soumettre le template de relance s'il n'existe pas. Aucune dépendance au dashboard : utilisé au démarrage du
 * bot ET par la page Réglages.
 */
export interface MetaEnv {
  token: string;
  wabaId?: string;
  phoneNumberId?: string;
  apiBase?: string;
}

export interface MetaTemplate {
  name: string;
  status: string;
  language: string;
  category?: string;
}

const base = (e: MetaEnv): string => e.apiBase ?? "https://graph.facebook.com/v21.0";
const auth = (e: MetaEnv) => ({ Authorization: `Bearer ${e.token}` });
const T = 10_000;

async function getJson(e: MetaEnv, path: string): Promise<{ ok: boolean; status: number; json: any }> {
  const r = await fetch(`${base(e)}${path}`, { headers: auth(e), signal: AbortSignal.timeout(T) });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
}

/**
 * Identifiant du compte WhatsApp Business. 1) variable WABA_ID ; 2) sinon découverte via le jeton
 * (debug_token) en choisissant le compte qui possède le numéro PHONE_NUMBER_ID.
 */
export async function resolveWabaId(e: MetaEnv): Promise<{ wabaId: string | null; source: string; error?: string }> {
  if (e.wabaId) return { wabaId: e.wabaId, source: "variable WABA_ID" };
  if (!e.token) return { wabaId: null, source: "", error: "WHATSAPP_TOKEN manquant" };
  try {
    const dbg = await getJson(e, `/debug_token?input_token=${encodeURIComponent(e.token)}`);
    const scopes: Array<{ scope?: string; target_ids?: string[] }> = dbg.json?.data?.granular_scopes ?? [];
    const candidates = scopes.filter((s) => s.scope === "whatsapp_business_management").flatMap((s) => s.target_ids ?? []);
    if (candidates.length === 0) {
      return { wabaId: null, source: "", error: `Aucun compte WhatsApp Business trouvé pour ce jeton (HTTP ${dbg.status}) : renseigner WABA_ID.` };
    }
    if (candidates.length === 1 || !e.phoneNumberId) return { wabaId: candidates[0]!, source: "découvert via le jeton" };
    for (const id of candidates) {
      const nums = await getJson(e, `/${id}/phone_numbers?fields=id`);
      if ((nums.json?.data ?? []).some((p: { id?: string }) => p.id === e.phoneNumberId)) return { wabaId: id, source: "découvert via le jeton (numéro correspondant)" };
    }
    return { wabaId: candidates[0]!, source: "découvert via le jeton (premier compte)" };
  } catch (err) {
    return { wabaId: null, source: "", error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listMetaTemplates(e: MetaEnv, wabaId: string): Promise<{ ok: boolean; templates: MetaTemplate[]; error?: string }> {
  try {
    const r = await getJson(e, `/${wabaId}/message_templates?fields=name,status,language,category&limit=200`);
    if (!r.ok) return { ok: false, templates: [], error: `Erreur API Meta (${r.status}) : ${JSON.stringify(r.json?.error?.message ?? r.json).slice(0, 300)}` };
    const templates = ((r.json?.data ?? []) as Array<Record<string, string>>).map((t) => ({
      name: t.name ?? "", status: t.status ?? "", language: t.language ?? "", category: t.category,
    }));
    return { ok: true, templates };
  } catch (err) {
    return { ok: false, templates: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export const RELANCE_TEMPLATE_NAME = "relance_client";
/** {{1}} = message personnalisé. Meta refuse un corps qui commence ou finit par une variable : texte fixe autour. */
export const RELANCE_TEMPLATE_BODY = "ARBI JACOB\n\n{{1}}\n\nRéponds ici pour continuer.";

export async function submitRelanceTemplate(e: MetaEnv, wabaId: string, language = "fr"): Promise<{ ok: boolean; status?: string; error?: string }> {
  try {
    const r = await fetch(`${base(e)}/${wabaId}/message_templates`, {
      method: "POST",
      headers: { ...auth(e), "Content-Type": "application/json" },
      signal: AbortSignal.timeout(T),
      body: JSON.stringify({
        name: RELANCE_TEMPLATE_NAME,
        language,
        category: "MARKETING",
        components: [{ type: "BODY", text: RELANCE_TEMPLATE_BODY, example: { body_text: [["Salut, je reviens vers toi par rapport à notre conversation."]] } }],
      }),
    });
    const json = (await r.json().catch(() => ({}))) as { status?: string; error?: { message?: string; error_user_msg?: string } };
    if (!r.ok) return { ok: false, error: json.error?.error_user_msg || json.error?.message || `HTTP ${r.status}` };
    return { ok: true, status: json.status ?? "PENDING" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface RelanceTemplateOutcome {
  action: "deja_approuve" | "en_attente" | "soumis" | "refuse_par_meta" | "echec" | "sans_compte";
  detail: string;
  templates: MetaTemplate[];
  wabaId: string | null;
}

/**
 * S'assure que le template de relance existe chez Meta : l'utilise s'il est déjà là (approuvé ou en attente),
 * sinon le soumet. Ne soumet jamais deux fois un template déjà présent (quelle que soit sa langue/son statut).
 */
export async function ensureRelanceTemplate(e: MetaEnv, language = "fr"): Promise<RelanceTemplateOutcome> {
  const waba = await resolveWabaId(e);
  if (!waba.wabaId) return { action: "sans_compte", detail: waba.error ?? "compte WhatsApp Business introuvable", templates: [], wabaId: null };
  const list = await listMetaTemplates(e, waba.wabaId);
  if (!list.ok) return { action: "echec", detail: list.error ?? "lecture des templates impossible", templates: [], wabaId: waba.wabaId };
  const mine = list.templates.filter((t) => t.name === RELANCE_TEMPLATE_NAME);
  const approved = mine.find((t) => t.status === "APPROVED" && t.language.startsWith(language));
  if (approved) return { action: "deja_approuve", detail: `« ${RELANCE_TEMPLATE_NAME} » est approuvé (${approved.language})`, templates: list.templates, wabaId: waba.wabaId };
  const pending = mine.find((t) => t.status === "PENDING" || t.status === "IN_APPEAL");
  if (pending) return { action: "en_attente", detail: `« ${RELANCE_TEMPLATE_NAME} » attend l'approbation de Meta`, templates: list.templates, wabaId: waba.wabaId };
  const sub = await submitRelanceTemplate(e, waba.wabaId, language);
  if (sub.ok) return { action: "soumis", detail: `« ${RELANCE_TEMPLATE_NAME} » soumis à Meta (statut ${sub.status})`, templates: list.templates, wabaId: waba.wabaId };
  return { action: "refuse_par_meta", detail: sub.error ?? "refusé", templates: list.templates, wabaId: waba.wabaId };
}
