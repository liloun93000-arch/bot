import type { Metadata } from "next";
import Link from "next/link";
import { Header, FloatingWa, BASE } from "./ui";
import { Reveal } from "./reveal";
import "./v2.css";

export const metadata: Metadata = { title: "ARBI JACOB — Formations, société, sourcing et digital" };

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="v2">
      <Reveal />
      <Header />
      <main className="v2-main">
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
