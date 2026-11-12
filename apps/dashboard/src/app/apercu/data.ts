/** Contenu de la vitrine ARBI JACOB (kit final). Tous les libellés de boutons en MAJUSCULES. */

export const SECRETARIAT = "33756975687";
/** Numéro de paiement (panier prêt / paiement hors boutique) — se termine par 01. */
export const PAIEMENT = "33778783701";
export const GHOST_WA = "33754830994";

/** Bouton général / flottant : WhatsApp sans texte (via le lien de suivi « site »). */
export const WA_GENERAL = "/go/site";

/** Bouton lié à une offre : texte court prérempli qui nomme l'offre (demande du kit). */
export function waOffre(texte: string): string {
  return `https://wa.me/${SECRETARIAT}?text=${encodeURIComponent(texte)}`;
}

export const NAV = [
  ["#accueil", "ACCUEIL"],
  ["#formations", "FORMATIONS"],
  ["#llc", "LLC / LTD"],
  ["#snapchat", "COMPTES SNAPCHAT"],
  ["#sourcing", "SOURCING"],
  ["#digital", "GRAPHISME & DIGITAL"],
  ["#affiliation", "AFFILIATION"],
  ["#qui", "QUI SUIS-JE"],
  ["#contact", "CONTACT"],
] as const;

export interface Offre {
  tag: string;
  titre: [string, string?];
  prix: string;
  accroche: string;
  points: string[];
  bouton: string;
  href: string;
  wa: boolean;
  encart?: { texte: string; bouton?: string; href?: string };
  phare?: boolean;
}

export const FORMATIONS: Offre[] = [
  {
    tag: "01 / IMPORT-EXPORT",
    titre: ["CHINA", "ACCESS"],
    prix: "600 €",
    accroche: "Une approche complète de l'import-export et du développement d'une activité, portée par l'expérience de l'équipe China Access.",
    points: ["Recherche de fournisseurs", "Échanges et négociations", "Commandes et organisation des opérations", "Formation en visio, accompagnement ensuite"],
    bouton: "ACHETER SUR CHINACCES.COM",
    href: "https://chinacces.com/products/formation-china-access",
    wa: false,
    encart: { texte: "Une question avant ?", bouton: "DEMANDER DES INFOS", href: waOffre("Bonjour, je voudrais des infos sur la formation China Access.") },
    phare: true,
  },
  {
    tag: "02 / AUDIENCE",
    titre: ["TRAFFIC", "PRO"],
    prix: "1 100 €",
    accroche: "Fais venir des gens vers toi, gratuitement, et transforme cette audience en argent.",
    points: [
      "Snapchat, TikTok, Instagram, Twitter/X et Telegram, plateforme par plateforme",
      "Plusieurs heures de vidéo et deux business concrets : vendre son trafic et monétiser des comptes à thème",
      "Accès à vie",
    ],
    bouton: "JE VEUX TRAFFIC PRO",
    href: "https://chinacces.com/products/trafic-pro",
    wa: false,
    encart: {
      texte: "Paiement en 4 fois possible : 750 € puis 3 × 250 € (1 500 € au total).",
      bouton: "PAYER EN 4 FOIS",
      href: waOffre("Bonjour, je suis intéressé par Traffic Pro en paiement en 4 fois."),
    },
    phare: true,
  },
  {
    tag: "03 / REVENTE",
    titre: ["VINTED", "PRO"],
    prix: "300 €",
    accroche: "Apprends l'achat-revente sur Vinted, de A à Z, et transforme ton compte en vraie source de revenus.",
    points: [
      "Trouver les bons produits, niches et fournisseurs",
      "Créer des annonces qui vendent : photos, descriptions, mots-clés, prix, négociation",
      "Développer ton compte et organiser les envois avec des modèles prêts à l'emploi",
      "Accès immédiat et à vie, support WhatsApp à vie",
    ],
    bouton: "JE VEUX VINTED PRO",
    href: "https://chinacces.com/products/vinted-pro",
    wa: false,
    encart: { texte: "Environ 3 jours pour tout assimiler, à ton rythme." },
  },
  {
    tag: "04 / LUXE",
    titre: ["SHOPPER", "PRO"],
    prix: "500 €",
    accroche: "Le carnet d'adresses du luxe authentique, prêt à l'emploi.",
    points: [
      "Environ 25 fournisseurs en France, en Europe et ailleurs",
      "Contacts, liens et façon de procéder pour chacun",
      "Commande possible dès une pièce selon le fournisseur",
      "Accès immédiat et à vie",
    ],
    bouton: "JE VEUX SHOPPER PRO",
    href: "https://chinacces.com/products/shopper-pro",
    wa: false,
  },
  {
    tag: "05 / MODÈLE D'ACTIVITÉ",
    titre: ["LOCATION", "DE VÉHICULES ALLEMANDS"],
    prix: "1 500 €",
    accroche: "Gagne de l'argent avec des voitures qui ne t'appartiennent pas.",
    points: [
      "Location longue durée en Allemagne puis relocation à la journée en France, selon les règles applicables",
      "Pas d'achat de véhicule dans le modèle présenté",
      "Le modèle que j'applique moi-même, expliqué étape par étape",
    ],
    bouton: "JE VEUX LA FORMATION",
    href: waOffre("Bonjour, je suis intéressé par la formation Location de véhicules allemands."),
    wa: true,
    encart: { texte: "Option accompagnement jusqu'à ta première voiture : +500 €." },
  },
];

export const LLC = [
  { f: "BASIQUE", nm: "545 €", wy: "799 €", d: "7 jours", top: false, c: "Création de la LLC, agent enregistré, numéro de téléphone américain, EIN." },
  { f: "PRESTIGE", nm: "690 €", wy: "945 €", d: "12 jours", top: true, c: "Basique + accompagnement à l'ouverture de 2 comptes Stripe, 1 PayPal Business, 1 Wise Business, 1 Mercury, 1 Payoneer Business et Shopify Payments." },
  { f: "ULTIME", nm: "850 €", wy: "1 130 €", d: "15 jours", top: false, c: "Prestige + configuration d'une boutique Shopify ou WordPress." },
];

/** Tarifs de départ Ghost Studio relevés dans le kit — À VÉRIFIER sur ghoststudio.store avant publication. */
export const GHOST_PRIX = [
  ["Flyer", "70 €"],
  ["Motion", "40 €"],
  ["Flyer animé", "90 €"],
  ["Format animé long", "150 €"],
  ["Logo", "50 €"],
  ["Personnage 3D", "30 € (20 € avec visuel fourni)"],
  ["Identité complète", "450 €"],
  ["Menu board", "130 €"],
  ["Filtre Snapchat", "40 €"],
  ["Shopify e-commerce", "dès 350 €"],
  ["Bot WhatsApp, site vitrine…", "SUR DEVIS"],
] as const;

export const FAQ = [
  ["Comment je paie ?", "Par carte sur la fiche produit quand elle existe. Sinon, une fois ton choix fait, paiement par virement, crypto ou PayPal sur WhatsApp au +33 7 78 78 37 01. Pour toute question : +33 7 56 97 56 87."],
  ["Combien de temps j'ai accès aux formations ?", "À vie pour les formations où cette modalité est confirmée."],
  ["Je ne suis pas en France, c'est possible ?", "Oui, beaucoup de démarches et d'échanges se font à distance. Vérifie les conditions de l'offre."],
  ["J'ai une question avant d'acheter ?", "Écris au secrétariat sur WhatsApp."],
] as const;
