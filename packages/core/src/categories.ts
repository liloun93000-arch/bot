/**
 * Catégories PRÉCISES des demandes clients (offres China Access, script V9.1).
 * Ordre = priorité : la première règle qui correspond l'emporte.
 */
export const FINE_CATEGORIES: Array<{ label: string; re: RegExp }> = [
  { label: "Après-vente / litige", re: /\b(rembours|litige|arnaque|pas re[cç]u|jamais re[cç]u|cass[ée]|d[ée]fectueu|r[ée]clamation|probl[eè]me (?:avec|de) (?:ma|mon) (?:commande|colis))/i },
  { label: "FRS iPhone / Apple", re: /\b(iphone|ipad|mac ?book|imac|airpods?|apple ?watch|apple|ios|1[5-9] ?pro|pro max|reconditionn|playstation|ps5|xbox|switch|console)/i },
  { label: "Volants", re: /\bvolants?\b|steering|carbone? (?:bmw|audi|mercedes|golf)|\bf30\b/i },
  { label: "Surron / véhicules électriques", re: /\b(surr?on|light ?bee|talaria|sting|xxx|ultra ?bee|e-?ride|moto[s]? [ée]lectrique|v[ée]hicule|scooter|trottinette|d9 ?pro|\bd5\b|falcon|homolog|quad|buggy)/i },
  { label: "Drones DJI", re: /\b(drones?|dji|mavic|avata|mini ?[2345]|air ?3|osmo|pocket|neo)\b/i },
  { label: "Starlink", re: /\bstarlink\b/i },
  { label: "NFC", re: /\bnfc\b/i },
  { label: "Snapchat (comptes)", re: /\b(snap(?:chat)?|\d{1,3} ?k (?:snap|abonn)|compte snap)/i },
  { label: "Vinted", re: /\bvinted\b/i },
  { label: "Trafic Pro", re: /\btrafic\b|\btraffic\b/i },
  { label: "Agents", re: /\bagents?\b|\bsourcing\b|\busine\b|1688|alibaba/i },
  { label: "Formation China Access", re: /\b(formation|china ?acc[eè]s|chinacces|former|apprendre|coaching|module)/i },
  { label: "Fournisseurs (accès)", re: /\b(fournisseurs?|frs|acc[eè]s|contact chinois)\b/i },
  { label: "Sites / Ghost Studio", re: /\b(site|boutique shopify|logo|ghost ?studio|landing)\b/i },
  { label: "Produit à l'unité (revendeur)", re: /\b(une paire|pour moi|[àa] l'unit[ée]|un seul|1 seul|sneakers?|sac|casquette|parfum)\b/i },
  { label: "Paiement", re: /\b(payer|paiement|paypal|virement|crypto|pcs|carte bancaire|lien de paiement)/i },
  { label: "Livraison / délais", re: /\b(livraison|livr[ée]|d[ée]lai|exp[ée]dition|douane|transport|combien de (?:temps|jours))/i },
];

/** Catégorie précise d'un texte client, ou null si rien de reconnaissable. */
export function fineCategory(text: string): string | null {
  const t = text.normalize("NFC");
  for (const c of FINE_CATEGORIES) if (c.re.test(t)) return c.label;
  return null;
}

/** Mots qui ne font pas une question : salutations, politesse, accusés de réception. */
const FILLER = new Set(
  (
    "salam salamalekoum salamalikoum salem slm wesh wsh bonjour bonsoir bjr bsr slt salut hello hi hey yo coucou cc " +
    "ok okay oki okk dac daccord d accord merci mrc thanks thank you top parfait super nickel cool vu recu bien " +
    "frere frerot khouya akhi gros mon ma le la les de du un une et a au svp stp please oui non ouais yes no ah oh " +
    "hein bah ben euh mdr ptdr lol re alors donc voila bisous bonne journee soiree nuit aleykoum alaykoum wa alaykoum"
  ).split(" "),
);

/** Mots qui signalent une vraie demande, même en un seul mot (« prix ? », « dispo ? »). */
const INTENT_WORD = /\b(prix|combien|tarif|dispo|disponible|stock|livraison|delai|catalogue|acheter|commander|payer|paiement|comment|pourquoi|quand|ou|quel|quelle|quels|quelles|est-ce|c'est quoi|info|infos|formation|fournisseur)\b/;

/**
 * Vraie question / demande client, ou simple message de politesse (« salam », « ??? », « ok merci »,
 * émojis…) ? Sert à ne garder que les vraies questions dans les statistiques et le top 10.
 */
export function isRealQuestion(text: string): boolean {
  const t = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\[[^\]]*\]\s*/g, "") // marqueurs « [Image reçue] » etc.
    .replace(/[’']/g, " ");
  const words = t.match(/[a-z0-9]+/g) ?? [];
  const meaningful = words.filter((w) => !FILLER.has(w) && w.length > 1);
  if (meaningful.length === 0) return false;
  if (meaningful.length >= 2) return true;
  return INTENT_WORD.test(t) || (t.includes("?") && (meaningful[0]?.length ?? 0) >= 3);
}
