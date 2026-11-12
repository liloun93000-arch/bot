import { NextResponse, type NextRequest } from "next/server";

/**
 * Lien de partage SANS connexion pour la Preview V2 (pour la montrer à quelqu'un) :
 * /preview-v2?k=<clé>. La clé pose un cookie pour naviguer ensuite dans l'aperçu.
 * Le site public n'est pas concerné ; l'aperçu reste non référencé (noindex).
 */
const PREVIEW_KEY = process.env.PREVIEW_V2_KEY || "N6lAWE6m6Ws8";

export function middleware(req: NextRequest) {
  const k = req.nextUrl.searchParams.get("k");
  const ok = k === PREVIEW_KEY || req.cookies.get("pv2")?.value === PREVIEW_KEY;
  const headers = new Headers(req.headers);
  headers.delete("x-pv2");
  if (ok) headers.set("x-pv2", "1");
  const res = NextResponse.next({ request: { headers } });
  if (k === PREVIEW_KEY) res.cookies.set("pv2", PREVIEW_KEY, { httpOnly: true, sameSite: "lax", secure: true, path: "/preview-v2", maxAge: 60 * 60 * 24 * 30 });
  return res;
}

export const config = { matcher: ["/preview-v2", "/preview-v2/:path*"] };
