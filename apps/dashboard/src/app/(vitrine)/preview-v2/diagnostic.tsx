/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { waOffre } from "../data";

type Reco = { titre: string; texte: string; ancre: string; wa: string };

const R: Record<string, Reco> = {
  china: { titre: "CHINA ACCESS", texte: "Import-export : fournisseurs, négociation, commandes.", ancre: "/preview-v2/formations/china-access", wa: "Bonjour, le diagnostic m'oriente vers China Access." },
  traffic: { titre: "TRAFFIC PRO", texte: "Fais venir du monde vers toi, gratuitement.", ancre: "/preview-v2/formations/traffic-pro", wa: "Bonjour, le diagnostic m'oriente vers Traffic Pro." },
  vinted: { titre: "VINTED PRO", texte: "Apprendre l'achat-revente pas à pas.", ancre: "/preview-v2/formations/vinted-pro", wa: "Bonjour, le diagnostic m'oriente vers Vinted Pro." },
  shopper: { titre: "SHOPPER PRO", texte: "Lancer une boutique et vendre en ligne.", ancre: "/preview-v2/formations/shopper-pro", wa: "Bonjour, le diagnostic m'oriente vers Shopper Pro." },
  llc: { titre: "LLC / LTD", texte: "Ta société à l'étranger, créée à distance.", ancre: "/preview-v2/societe", wa: "Bonjour, je souhaite créer ma société (LLC / LTD)." },
  sourcing: { titre: "SOURCING", texte: "On cherche le produit et le bon fournisseur.", ancre: "/preview-v2/sourcing", wa: "Bonjour, je cherche un fournisseur." },
  snap: { titre: "COMPTES SNAPCHAT", texte: "Des comptes prêts pour vendre et communiquer.", ancre: "/preview-v2/snapchat", wa: "Bonjour, je souhaite voir les comptes Snapchat disponibles." },
  ghost: { titre: "GHOST STUDIO", texte: "Logo, flyers, site, Shopify : ton image pro.", ancre: "/preview-v2/ghost-studio", wa: "Bonjour, j'ai besoin d'un visuel / d'un site avec Ghost Studio." },
  bot: { titre: "ASSISTANT WHATSAPP", texte: "Tes messages répondent même quand tu es occupé.", ancre: "/preview-v2/assistant", wa: "Bonjour, je veux un assistant WhatsApp pour mon business." },
  appel: { titre: "APPEL AVEC JACOB", texte: "15 min offertes pour faire le point ensemble.", ancre: "/preview-v2#rdv", wa: "Bonjour, je ne sais pas par où commencer." },
};

const Q: Array<{ id: string; label: string; q2: string; choix: Array<{ label: string; recos: string[] }> }> = [
  { id: "lancer", label: "Je veux me lancer", q2: "Qu'est-ce qui te parle le plus ?", choix: [
    { label: "Acheter-revendre", recos: ["vinted", "china"] },
    { label: "Vendre en ligne", recos: ["shopper", "traffic"] },
    { label: "Je ne sais pas encore", recos: ["appel", "vinted"] },
  ] },
  { id: "business", label: "J'ai déjà un business", q2: "De quoi as-tu besoin ?", choix: [
    { label: "Plus de clients", recos: ["traffic", "snap"] },
    { label: "Une meilleure image", recos: ["ghost"] },
    { label: "Gagner du temps", recos: ["bot"] },
  ] },
  { id: "fournisseur", label: "Je cherche un fournisseur", q2: "Tu préfères…", choix: [
    { label: "Qu'on le trouve pour moi", recos: ["sourcing"] },
    { label: "Apprendre à le faire", recos: ["china"] },
  ] },
  { id: "ventes", label: "Je veux développer mes ventes", q2: "Où vends-tu ?", choix: [
    { label: "Réseaux sociaux", recos: ["traffic", "snap"] },
    { label: "Boutique en ligne", recos: ["shopper", "ghost"] },
    { label: "Sur WhatsApp", recos: ["bot"] },
  ] },
  { id: "societe", label: "Je veux créer une société", q2: "Où en es-tu ?", choix: [
    { label: "Je sais ce que je veux", recos: ["llc"] },
    { label: "J'ai besoin de conseils", recos: ["llc", "appel"] },
  ] },
  { id: "apprendre", label: "Je veux apprendre", q2: "Quel sujet ?", choix: [
    { label: "Import / Chine", recos: ["china"] },
    { label: "Audience / réseaux", recos: ["traffic"] },
    { label: "Achat-revente", recos: ["vinted", "shopper"] },
  ] },
];

export function Diagnostic() {
  const [q1, setQ1] = useState<string | null>(null);
  const [recos, setRecos] = useState<string[] | null>(null);
  const cur = Q.find((x) => x.id === q1);
  const reset = () => {
    setQ1(null);
    setRecos(null);
  };
  const etape = recos ? 3 : cur ? 2 : 1;

  return (
    <div className="v2-diag" aria-live="polite">
      <div className="v2-diag-steps" aria-hidden>
        {[1, 2, 3].map((n) => (
          <i key={n} className={n <= etape ? "is-on" : ""} />
        ))}
      </div>
      {!cur && (
        <>
          <p className="v2-diag-q">Où en es-tu aujourd&apos;hui ?</p>
          <div className="v2-diag-opts">
            {Q.map((x) => (
              <button key={x.id} type="button" onClick={() => setQ1(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
        </>
      )}
      {cur && !recos && (
        <>
          <p className="v2-diag-q">{cur.q2}</p>
          <div className="v2-diag-opts">
            {cur.choix.map((c) => (
              <button key={c.label} type="button" onClick={() => setRecos(c.recos)}>
                {c.label}
              </button>
            ))}
          </div>
          <button type="button" className="v2-diag-back" onClick={reset}>
            ← Retour
          </button>
        </>
      )}
      {recos && (
        <>
          <p className="v2-diag-q">Voilà ce que je te conseille :</p>
          <div className="v2-diag-res">
            {recos.map((k) => {
              const r = R[k]!;
              return (
                <div key={k} className="v2-diag-card">
                  <b>{r.titre}</b>
                  <span>{r.texte}</span>
                  <a href={r.ancre} className="v2-link">
                    VOIR L&apos;OFFRE →
                  </a>
                </div>
              );
            })}
          </div>
          <a className="btn btn-whatsapp" href={waOffre(R[recos[0]!]!.wa)} target="_blank" rel="noopener noreferrer">
            <img src="/vitrine/whatsapp.svg" alt="" width={23} height={23} /> PARLER AVEC JACOB SUR WHATSAPP
          </a>
          <button type="button" className="v2-diag-back" onClick={reset}>
            ↺ Recommencer
          </button>
        </>
      )}
    </div>
  );
}
