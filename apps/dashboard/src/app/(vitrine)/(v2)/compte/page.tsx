import Link from "next/link";
import { BASE, PageTop } from "../ui";

/**
 * Emplacement de l'espace client (à construire) : connexion du client, puis selon ses achats
 * formations, commandes, dossier (LLC…), documents demandés / envoyés, avancement, factures.
 */
const BLOCS = [
  ["🎓", "MES FORMATIONS", "Accès au contenu des formations achetées."],
  ["📦", "MES COMMANDES", "Historique et suivi de tes achats."],
  ["📁", "MON DOSSIER", "Création de société : avancement étape par étape."],
  ["📎", "DOCUMENTS", "Envoie les documents demandés, en toute sécurité."],
  ["🧾", "FACTURES", "Tes factures à télécharger."],
  ["👤", "MES INFORMATIONS", "Coordonnées et préférences."],
];

export default function Compte() {
  return (
    <section className="section">
      <PageTop eyebrow="MON COMPTE" titre={<>TON <span className="red-text">ESPACE CLIENT</span></>} intro="Bientôt : connecte-toi pour retrouver tout ce que tu as acheté au même endroit." />
      <div className="v2-account-grid">
        {BLOCS.map(([i, t, d]) => (
          <div key={t} className="v2-account-card" data-reveal>
            <span aria-hidden>{i}</span>
            <b>{t}</b>
            <small>{d}</small>
            <em>BIENTÔT</em>
          </div>
        ))}
      </div>
      <p className="v2-muted v2-mt">En attendant, pour toute demande sur un achat : le secrétariat sur WhatsApp.</p>
      <Link href="/" className="v2-go v2-mt">
        ← RETOUR À L&apos;ACCUEIL
      </Link>
    </section>
  );
}
