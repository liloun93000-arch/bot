import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { getSessionUser } from "@/lib/auth";
import { exportDir, exportFilePath, getJob } from "@/lib/export-conversations";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Non autorisé", { status: 401 });
  const dir = exportDir();
  const job = getJob(dir, new URL(req.url).searchParams.get("id") ?? "");
  const path = job ? exportFilePath(dir, job) : null;
  if (!job || !path) return new Response("Export introuvable ou non terminé.", { status: 404 });
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(job.taille),
      "Content-Disposition": `attachment; filename="${job.fichier}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
