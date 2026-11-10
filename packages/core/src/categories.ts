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
