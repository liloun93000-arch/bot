import Link from "next/link";
import { Faq, WaButton } from "./_v/ui";

const CARTES = [
  { href: "/formations", titre: "Formations", texte: "Des méthodes appliquées, pas de la théorie.", ico: "🎓" },
  { href: "/creation-llc-ltd", titre: "Création de LLC / LTD", texte: "Ta société américaine ou hongkongaise, dès 545 €.", ico: "🏛️" },
  { href: "/comptes-snapchat", titre: "Comptes Snapchat", texte: "Une audience déjà prête, sans repartir de zéro.", ico: "👻" },
  { href: "/graphisme-digital", titre: "Graphisme & digital", texte: "Site, logo, bot, automatisations.", ico: "✨" },
];

export default function Accueil() {
  return (
    <>
      <section className="cv-hero">
        <div className="cv-wrap">
          <h1 className="cv-hero-title">
            Lance ton business. <span>On s&apos;occupe du reste.</span>
          </h1>
          <p className="cv-lead">
            Formations, création de société, comptes Snapchat et services digitaux. Une seule personne à contacter,
            une réponse rapide sur WhatsApp.
          </p>
          <WaButton big message="Bonjour Jacob, je viens de ton site.">
            Me contacter sur WhatsApp
          </WaButton>
        </div>
      </section>

      <section className="cv-section">
        <div className="cv-wrap cv-grid-cards">
          {CARTES.map((c) => (
            <Link key={c.href} href={c.href} className="cv-card cv-tile">
              <span className="cv-tile-ico" aria-hidden>
                {c.ico}
              </span>
              <span className="cv-tile-t">{c.titre}</span>
              <span className="cv-tile-d">{c.texte}</span>
              <span className="cv-tile-go" aria-hidden>
                →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="cv-trust">
        <div className="cv-wrap">Réponse rapide sur WhatsApp • Accès à vie aux formations • Tout se fait à distance</div>
      </div>

      <Faq />
    </>
  );
}
