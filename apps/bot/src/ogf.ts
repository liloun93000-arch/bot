/**
 * OG FACTORY (« OGF », « OGFACTORY ») : toute demande qui les concerne est redirigée vers leurs
 * coordonnées à jour. Réponse directe, sans IA et sans alerte Jacob — le modèle avait tendance à
 * « prévenir Jacob » pour une réclamation, alors que ce n'est pas à Jacob de traiter ces demandes.
 */
export const OGF_SITE = "https://www.ogfactory.shop";
export const OGF_PHONE = "+33 7 80 96 29 20";
export const OGF_TELEGRAM = "@Ogfactoryshop_bot";

/** « OG Factory », « OG-Factory », « ogfactory », « OGF » (mot entier, pour ne pas toucher « ogfoo… »). */
export const OGF_RE = /(?<![a-z0-9])(?:og[\s-]*factory|ogf)(?![a-z0-9])/i;

const COMPLAINT_RE = /\b(mois|semaines?|commande[ée]?s?|colis|livr|rembours|r[ée]pon(?:d|se)|nouvelles|arnaque|probl[eè]me|attend|toujours rien|jamais)\b/i;

export function mentionsOgf(texts: string[]): boolean {
  return texts.some((t) => OGF_RE.test(t));
}

export function ogfReply(texts: string[]): string {
  const complaint = texts.some((t) => COMPLAINT_RE.test(t));
  const intro = complaint
    ? "Je comprends ton agacement 🙏 Pour tout ce qui concerne OG Factory (commande, suivi, catalogue), ils ont de nouvelles coordonnées : c'est là qu'il faut les contacter maintenant."
    : "Pour OG Factory, voici leurs coordonnées à jour :";
  return `${intro}\n\n• Site : ${OGF_SITE}\n• Numéro (assistant personnel) : ${OGF_PHONE}\n• Telegram : ${OGF_TELEGRAM}`;
}
