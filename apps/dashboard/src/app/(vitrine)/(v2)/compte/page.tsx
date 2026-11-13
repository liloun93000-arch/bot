import Link from "next/link";
import { PageTop } from "../ui";
import { pageMeta } from "../seo";

export function generateMetadata() {
  return pageMeta("/compte", "Mon compte — Espace client ARBI JACOB", "Accède à ton espace : formations, commandes et dossiers (espace client), ou connexion de l'équipe ARBI JACOB.");
}

/**
 * Mon compte : deux espaces.
 * - Espace client : pas encore ouvert (bloqué, « bientôt disponible »).
 * - Espace administrateur : la connexion existante du dashboard (identifiants admin déjà enregistrés).
 *   Aucune création de compte possible depuis le site.
 */
export default function Compte() {
  return (
    <section className="section">
      <PageTop eyebrow="MON COMPTE" titre={<>CHOISIS TON <span className="red-text">ESPACE</span></>} />
      <div className="v2-spaces">
        <div className="v2-space is-locked" aria-disabled="true">
          <span className="v2-space-ico" aria-hidden>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </svg>
          </span>
          <b>ESPACE CLIENT</b>
          <small>Tes formations, commandes et dossiers au même endroit.</small>
          <em>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
            BIENTÔT DISPONIBLE
          </em>
        </div>
        <Link href="/admin/login" className="v2-space">
          <span className="v2-space-ico" aria-hidden>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </span>
          <b>ESPACE ADMINISTRATEUR</b>
          <small>Réservé à l&apos;équipe ARBI JACOB, avec les identifiants de connexion.</small>
          <span className="v2-go">
            SE CONNECTER <i>→</i>
          </span>
        </Link>
      </div>
    </section>
  );
}
