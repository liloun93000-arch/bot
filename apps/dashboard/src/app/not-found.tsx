/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import "./(vitrine)/kit.css";
import "./(vitrine)/vitrine.css";
import "./(vitrine)/(v2)/v2.css";

export const metadata: Metadata = { title: "Page introuvable — ARBI JACOB", robots: { index: false } };

/** 404 aux couleurs du site : Jacob, un message court et le chemin du retour. */
export default function NotFound() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,700;0,800;1,800&family=Inter:wght@400;600;800&display=swap"
      />
      <div className="kv">
        <div className="v2 js-on">
          <main className="v2-404">
            <img src="/vitrine/mascotte.webp" alt="" width={1000} height={907} className="v2-404-img" />
            <p className="v2-404-code">404</p>
            <h1>
              CETTE PAGE <span className="red-text">N&apos;EXISTE PAS.</span>
            </h1>
            <p className="v2-404-txt">Le lien est peut-être ancien ou mal recopié. Pas grave, on te ramène au bon endroit.</p>
            <div className="v2-404-btns">
              <Link href="/" className="btn btn-brand">
                RETOUR À L&apos;ACCUEIL <span className="arrow">→</span>
              </Link>
              <Link href="/formations" className="btn btn-silver">
                VOIR LES FORMATIONS
              </Link>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
