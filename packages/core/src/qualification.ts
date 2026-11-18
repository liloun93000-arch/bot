/**
 * Qualification d'un prospect dont le SUJET n'est pas encore connu.
 *
 * « Salut, j'aimerais avoir des informations » n'est pas un blocage : c'est le
 * début d'une conversation. Le bot doit demander ce que cherche le client, pas
 * alerter Jacob.
 */

/** Mots de politesse / de demande générique qui ne désignent AUCUN sujet. */
const GENERIC_WORDS = new Set(
  (
    "bonjour bonsoir salut hello hey coucou slt cc yo bjr " +
    "svp stp s il vous te plait merci " +
    "je j tu vous il on nous me m t l la le les un une des de du d au aux a ai as avez avons en y et ou " +
    "aimerais voudrais souhaite souhaiterais veux voulais cherche recherche besoin " +
    "avoir obtenir recevoir savoir connaitre demander poser question questions " +
    "info infos information informations renseignement renseignements renseigner renseigne detail details precision precisions " +
    "sur propos concernant rapport pour vos votre vos nos notre ton ta tes ma mon mes " +
    "service services offre offres prestation prestations produit produits activite activites " +
    "que qui quoi quel quels quelle quelles est sont faites faire proposez propose proposes fait " +
    "ca ce cela comment marche fonctionne pouvez pouvoir peux pourriez pourrais dire dites expliquer expliquez " +
    "plus beaucoup un peu quelques plusieurs tout tous toutes " +
    "interesse interessee interessant ok oui non d accord"
  ).split(/\s+/),
);

function tokens(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\[[^\]]*\]\s*/g, "")
    .replace(/[’']/g, " ")
    .match(/[a-z0-9]+/g) ?? [];
}

/**
 * Vrai quand le message ne contient que de la politesse et une demande
 * d'information générique (aucun produit, service ni sujet identifiable).
 */
export function isSubjectlessRequest(text: string): boolean {
  const words = tokens(text);
  if (words.length === 0) return false;
  if (words.length > 14) return false;
  return words.every((w) => GENERIC_WORDS.has(w));
}

/** Consigne injectée à l'agent tant que le sujet du client est inconnu. */
export function qualificationHint(round: number): string {
  const base =
    "# Qualification du besoin (sujet inconnu)\nLe client n'a pas encore dit ce qu'il cherche. Ce n'est PAS un blocage : N'APPELLE AUCUN outil d'alerte ni ask_director et ne dis jamais que tu transmets à Jacob. Prends l'initiative : réponds chaleureusement, puis pose UNE question simple pour identifier son besoin (fournisseurs, formations, création de société, autre service), en une ou deux phrases naturelles.";
  if (round >= 2) {
    return `${base}\nLe client est resté vague après ta question : ne réinsiste pas lourdement. Propose en une phrase les grands domaines que tu couvres et dis-lui qu'il peut te répondre quand il veut. Toujours aucune alerte.`;
  }
  return base;
}
