import Link from "next/link";

export default function SiteNotFound() {
  return (
    <section className="cv-pagehead">
      <div className="cv-wrap">
        <h1 className="cv-h1">Page introuvable</h1>
        <p className="cv-lead">Cette page n&apos;existe pas.</p>
        <Link href="/" className="cv-btn cv-btn-red">
          ← Retour à l&apos;accueil
        </Link>
      </div>
    </section>
  );
}
