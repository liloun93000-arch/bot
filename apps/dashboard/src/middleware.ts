import { NextResponse, type NextRequest } from "next/server";

/** Plus de boutique publique : toute adresse hors back-office renvoie vers la page de connexion. */
export function middleware(req: NextRequest) {
  return NextResponse.redirect(new URL("/admin/login", req.url));
}

export const config = {
  // Tout sauf /admin, /api, les fichiers Next et l'icône.
  matcher: ["/((?!admin|api|_next|icon\\.svg|favicon\\.ico|intro-connexion).*)"],
};
