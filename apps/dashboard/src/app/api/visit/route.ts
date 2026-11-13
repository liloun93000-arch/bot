import { getRuntime } from "@/lib/core";
import { BOT_VISIT_RE, recordVisit, visitorId } from "@/lib/visits";

export const dynamic = "force-dynamic";

/** Une page du site public vue (envoyé par le navigateur du visiteur). Robots ignorés. */
export async function POST(request: Request): Promise<Response> {
  try {
    const ua = request.headers.get("user-agent") ?? "";
    if (!ua || BOT_VISIT_RE.test(ua)) return new Response(null, { status: 204 });
    const body = (await request.json().catch(() => ({}))) as { path?: string };
    const path = typeof body.path === "string" && body.path.startsWith("/") && !body.path.startsWith("/admin") ? body.path : "/";
    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
    recordVisit(getRuntime().core, { path, vid: visitorId(ip, ua, Date.now()) });
  } catch {
    /* une statistique ne doit jamais casser le site */
  }
  return new Response(null, { status: 204 });
}
