import Link from "next/link";
import { notFound } from "next/navigation";
import { FAQ } from "../../../data";
import { Wa } from "../../../wa-icon";
import { BASE, PageTop, formationBySlug } from "../../ui";

export default async function FormationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const o = formationBySlug(slug);
  if (!o) notFound();
  const paiement = FAQ.find(([q]) => /paie/i.test(q));
  return (
    <section className="section">
      <PageTop eyebrow={o.tag} titre={<>{o.titre[0]} {o.titre[1] && <span className="red-text">{o.titre[1]}</span>}</>} intro={o.accroche} />
      <div className="v2-detail">
        <div className="v2-detail-main" data-reveal>
          <h2 className="v2-h3">AU PROGRAMME</h2>
          <ul className="v2-card-points">
            {o.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {paiement && (
            <>
              <h2 className="v2-h3">PAIEMENT</h2>
              <p className="v2-muted">{paiement[1]}</p>
            </>
          )}
        </div>
        <aside className="v2-buy" data-reveal>
          <small>PRIX</small>
          <b className="v2-price">{o.prix}</b>
          {o.encart && !o.encart.href && <p className="v2-muted">{o.encart.texte}</p>}
          <a className={`btn ${o.wa ? "btn-whatsapp" : "btn-brand"}`} href={o.href} target="_blank" rel="noopener noreferrer">
            {o.wa && <Wa />} {o.wa ? "DEMANDER SUR WHATSAPP" : "COMMANDER"} {!o.wa && <span className="arrow">↗</span>}
          </a>
          {o.encart?.href && (
            <a className="v2-go" href={o.encart.href} target="_blank" rel="noopener noreferrer">
              {o.encart.texte} {o.encart.bouton} <i>→</i>
            </a>
          )}
        </aside>
      </div>
      <Link href={`${BASE}/formations`} className="v2-go v2-mt">
        ← TOUTES LES FORMATIONS
      </Link>
    </section>
  );
}
