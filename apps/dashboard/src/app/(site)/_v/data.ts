/** Contenu du site vitrine de Jacob (brief validé). Un seul endroit à modifier. */

export const WA_NUMBER = "33756975687";
export const WA_DISPLAY = "+33 7 56 97 56 87";

/**
 * Lien WhatsApp du site : passe par le lien de suivi « site » (clic compté) puis ouvre WhatsApp
 * SANS message prérempli — le client écrit ce qu'il veut. Le paramètre est gardé pour mémoire
 * de l'offre concernée mais n'est plus envoyé.
 */
export function wa(_offre?: string): string {
  return "/go/site";
}

export const NAV = [
  { href: "/", label: "Accueil" },
  { href: "/formations", label: "Formations" },
  { href: "/creation-llc-ltd", label: "Création de LLC / LTD" },
  { href: "/comptes-snapchat", label: "Comptes Snapchat" },
  { href: "/graphisme-digital", label: "Graphisme & digital" },
  { href: "/qui-suis-je", label: "Qui suis-je" },
  { href: "/contact", label: "Contact" },
] as const;

export interface Formation {
  titre: string;
  prix: string;
  accroche: string;
  points: string[];
  bouton: string;
  href: string;
  externe: boolean;
  encart?: { texte: string; href?: string; bouton?: string };
}

export const FORMATIONS: Formation[] = [
  {
    titre: "Trafic Pro",
    prix: "1 100 €",
    accroche: "Fais venir des gens vers toi, gratuitement, et transforme cette audience en argent.",
    points: [
      "Snapchat, TikTok, Instagram, Twitter/X et Telegram, plateforme par plateforme",
      "Plusieurs heures de vidéo et deux business concrets : vendre son trafic, monétiser des comptes à thème",
      "Accès à vie",
    ],
    bouton: "Je veux Trafic Pro",
    href: "https://chinacces.com/products/trafic-pro",
    externe: true,
    encart: {
      texte: "Paiement en 4 fois possible : 750 € puis 3 × 250 € (1 500 € au total).",
      href: wa("Bonjour Jacob, je suis intéressé par Trafic Pro en paiement en 4 fois."),
      bouton: "Payer en 4 fois",
    },
  },
  {
    titre: "Vinted Pro",
    prix: "300 €",
    accroche: "Apprends l'achat-revente sur Vinted, de A à Z, et transforme ton compte en vraie source de revenus.",
    points: [
      "Trouver les bons produits, les bonnes niches et les bons fournisseurs",
      "Des annonces qui vendent : photos, descriptions, mots-clés, prix, négociation",
      "Développer ton compte et organiser tes envois, avec des modèles prêts à l'emploi",
      "Accès immédiat et à vie, support WhatsApp à vie",
    ],
    bouton: "Je veux Vinted Pro",
    href: "https://chinacces.com/products/vinted-pro",
    externe: true,
    encart: { texte: "Environ 3 jours pour tout assimiler, à ton rythme." },
  },
  {
    titre: "Shopper Pro",
    prix: "500 €",
    accroche: "Le carnet d'adresses du luxe authentique, prêt à l'emploi.",
    points: [
      "Environ 25 fournisseurs en France, en Europe et ailleurs",
      "Contacts, liens et façon de procéder pour chacun",
      "Commande possible dès une pièce selon le fournisseur",
      "Accès immédiat et à vie",
    ],
    bouton: "Je veux Shopper Pro",
    href: "https://chinacces.com/products/shopper-pro",
    externe: true,
  },
  {
    titre: "Formation China Access",
    prix: "600 €",
    accroche: "Importer depuis la Chine, de A à Z, en direct avec Jacob.",
    points: [
      "Visioconférence de 5 à 10 h",
      "Import-export, fournisseurs, agents, logistique et WeChat",
    ],
    bouton: "Je veux la formation China Access",
    href: "https://chinacces.com/products/formation-china-access",
    externe: true,
  },
  {
    titre: "Agents China Access",
    prix: "dès 350 €",
    accroche: "La formation, plus des agents sur place en Chine.",
    points: ["La formation China Access", "De 1 à 3 agents en Chine"],
    bouton: "Je veux les agents",
    href: "https://chinacces.com/products/china-access",
    externe: true,
  },
  {
    titre: "Location de véhicules allemands",
    prix: "1 500 €",
    accroche: "Gagne de l'argent avec des voitures qui ne t'appartiennent pas.",
    points: [
      "Tu loues en longue durée en Allemagne, tu reloues à la journée en France",
      "Pas d'achat de véhicule, pas de décote, une flotte qui peut grandir vite",
      "Le modèle que j'applique moi-même, expliqué étape par étape",
    ],
    bouton: "Je veux la formation",
    href: wa("Bonjour Jacob, je suis intéressé par la formation Location de véhicules allemands."),
    externe: false,
    encart: { texte: "Option accompagnement jusqu'à ta première voiture : +500 €." },
  },
];

export const LLC = [
  { formule: "Basique", nm: "545 €", wy: "799 €", delai: "7 jours", top: false, contenu: "Création de la LLC, agent enregistré, numéro de téléphone américain, EIN" },
  { formule: "Prestige", nm: "690 €", wy: "945 €", delai: "12 jours", top: true, contenu: "Tout le Basique + ouverture accompagnée de 2 comptes Stripe, 1 PayPal Business, 1 Wise Business, 1 compte Mercury, 1 Payoneer Business, Shopify Paiement" },
  { formule: "Ultime", nm: "850 €", wy: "1 130 €", delai: "15 jours", top: false, contenu: "Tout le Prestige + configuration de ta boutique Shopify ou WordPress" },
];

export const FAQ = [
  { q: "Comment je paie ?", r: "Par carte sur la fiche produit, ou par PayPal, virement ou crypto via WhatsApp." },
  { q: "Combien de temps j'ai accès aux formations ?", r: "À vie." },
  { q: "Je ne suis pas en France, c'est possible ?", r: "Oui, tout se fait à distance." },
  { q: "J'ai une question avant d'acheter ?", r: "Écris-nous sur WhatsApp, on te répond rapidement." },
];

export const GHOST = {
  whatsapp: "https://wa.me/33754830994?text=" + encodeURIComponent("Bonjour Ghost Studio, je viens de la part de Jacob."),
  whatsappDisplay: "07 54 83 09 94",
  site: "https://ghoststudio.store",
  snapchat: "https://www.snapchat.com/add/GHOST-STUDIO",
};
