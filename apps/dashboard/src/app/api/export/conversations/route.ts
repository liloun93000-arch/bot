import { getSessionUser } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { dbFile, exportDir, getJob, startExport } from "@/lib/export-conversations";

export const dynamic = "force-dynamic";

/** Lance un export. Corps : { mode: "toutes" | "filtre" | "choix", ids?: string[], q?, statut? } — réservé à l'admin connecté. */
export async function POST(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Non autorisé", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string" && /^\d{5,20}$/.test(x)) : [];
  if (ids.length === 0) return Response.json({ error: "Aucune conversation sélectionnée." }, { status: 400 });
  const { core } = getRuntime();
  const known = new Set(core.conversationOverview().map((r) => r.waId));
  const valid = ids.filter((id) => known.has(id));
  if (valid.length === 0) return Response.json({ error: "Conversations introuvables." }, { status: 400 });
  try {
    return Response.json(startExport(core, dbFile(), valid));
  } catch (err) {
    return Response.json({ error: String((err as Error).message) }, { status: 409 });
  }
}

/** État d'un export : ?id=… */
export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Non autorisé", { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const job = getJob(exportDir(dbFile()), id);
  if (!job) return Response.json({ error: "Export introuvable." }, { status: 404 });
  return Response.json(job);
}
