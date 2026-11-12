import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { requireSession } from "@/lib/auth";
import { Header, FloatingWa, BASE } from "./ui";
import { Reveal } from "./reveal";
import "./v2.css";

export const metadata: Metadata = { title: "ARBI JACOB — Preview V2", robots: { index: false, follow: false } };

export default async function PreviewV2Layout({ children }: { children: React.ReactNode }) {
  // Accès : session admin, ou lien de partage (?k=…) validé par le middleware.
  if ((await headers()).get("x-pv2") !== "1") await requireSession();
  return (
    <div className="v2">
      <Reveal />
      <Header />
      <main className="v2-main">
        <div className="v2-bar">
          PREVIEW V2 — visible seulement depuis l&apos;admin · <Link href="/admin">DASHBOARD</Link>
        </div>
        {children}
      </main>
      <footer className="v2-foot">
        <span>© ARBI JACOB</span>
        <span>
          <Link href={`${BASE}/a-propos`}>À PROPOS</Link> · <Link href="/conditions">CONDITIONS</Link> ·{" "}
          <Link href="/confidentialite">CONFIDENTIALITÉ</Link>
        </span>
      </footer>
      <FloatingWa />
    </div>
  );
}
