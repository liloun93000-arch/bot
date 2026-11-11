import { getRuntime } from "@/lib/core";
import { BOT_UA_RE, WA_DESTINATION, recordClick, sourceBySlug } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * Lien de suivi : compte le clic pour la source, puis redirige IMMÉDIATEMENT vers WhatsApp,
 * sans page intermédiaire et sans message prérempli. Les aperçus de liens (robots de Snapchat,
 * Telegram, WhatsApp…) sont redirigés mais NE sont PAS comptés.
 */
export async function GET(request: Request, { params }: { params: Promise<{ source: string }> }): Promise<Response> {
  const { source } = await params;
  const destination = `https://wa.me/${WA_DESTINATION}`;
  try {
    const { core } = getRuntime();
    const src = sourceBySlug(core, source.toLowerCase());
    const ua = request.headers.get("user-agent") ?? "";
    if (src && src.actif === 1 && !BOT_UA_RE.test(ua)) recordClick(core, src.id);
  } catch {
    /* le comptage ne doit jamais bloquer la redirection */
  }
  return new Response(null, {
    status: 302,
    headers: { Location: destination, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

/** Les requêtes HEAD (vérifications de lien) ne sont jamais comptées. */
export function HEAD(): Response {
  return new Response(null, { status: 302, headers: { Location: `https://wa.me/${WA_DESTINATION}`, "Cache-Control": "no-store" } });
}
