import Link from "next/link";

/** Brouillon de page légale : champs à compléter par Jacob, rien d'inventé. */
export function LegalDraft({ titre, sections }: { titre: string; sections: Array<[string, string]> }) {
  return (
    <main className="section kv-legal">
      <p className="kv-preview-bar">BROUILLON — À COMPLÉTER ET FAIRE VALIDER AVANT PUBLICATION</p>
      <h1>{titre}</h1>
      {sections.map(([h, t]) => (
        <section key={h}>
          <h2>{h}</h2>
          <p>{t}</p>
        </section>
      ))}
      <Link href="/apercu" className="btn btn-brand btn-compact">
        RETOUR
      </Link>
    </main>
  );
}
