import { levenshtein, normalizeText } from "./intents";
import { PAYMENT_OUTBOUND_RE } from "./pricing";

/**
 * MANAGER IA / DIRECTEUR — base de connaissances structurée et escalades.
 *
 * Ce module est volontairement AUTONOME (SQL brut + fonctions pures) : il
 * s'ajoute au core sans toucher aux dépôts existants. Il décrit :
 *  - les connaissances apprises auprès de Jacob (sujet, thème, offre,
 *    intention, réponse métier, conditions, exceptions) avec historique ;
 *  - les escalades (question posée à Jacob sur WhatsApp, conversations
 *    concernées, statut « en attente » / « résolue ») ;
 *  - le rapprochement sémantique léger (concepts + recouvrement lexical) qui
 *    donne un NIVEAU DE CONFIANCE sans appel LLM ;
 *  - la détection de contradictions (Jacob reste l'autorité supérieure).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type KnowledgeSource = "jacob" | "correction" | "admin";
export type KnowledgeStatus = "actif" | "remplace" | "supprime";

export interface KnowledgeEntry {
  id: number;
  sujet: string;
  theme: string;
  categorie: string;
  offreCle: string;
  /** Question canonique, impersonnelle (« Le paiement en plusieurs fois est-il possible ? »). */
  intention: string;
  /** La réponse métier : ce qui est vrai pour l'entreprise. */
  reponse: string;
  /** Conditions à respecter (« uniquement à partir de 500 € »). Jamais simplifiées. */
  conditions: string;
  exceptions: string;
  /** Formulations de clients rattachées à cette connaissance. */
  variantes: string[];
  source: KnowledgeSource;
  statut: KnowledgeStatus;
  version: number;
  remplaceId: number | null;
  escalationId: number | null;
  questionOrigine: string;
  /** Texte brut de Jacob, conservé pour traçabilité. */
  reponseJacob: string;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeInput {
  sujet?: string;
  theme?: string;
  categorie?: string;
  offreCle?: string;
  intention: string;
  reponse: string;
  conditions?: string;
  exceptions?: string;
  variantes?: string[];
  source?: KnowledgeSource;
  escalationId?: number | null;
  questionOrigine?: string;
  reponseJacob?: string;
}

export type KnowledgeHistoryAction =
  | "creation"
  | "mise_a_jour"
  | "correction"
  | "remplacement"
  | "suppression"
  | "edition_admin"
  | "conflit";

export interface KnowledgeHistoryRow {
  id: number;
  entryId: number;
  action: KnowledgeHistoryAction;
  avant: Partial<KnowledgeEntry> | null;
  apres: Partial<KnowledgeEntry> | null;
  raison: string;
  source: string;
  createdAt: number;
}

/** en_attente → repondue (réponse de Jacob reliée) → resolue (« traité » : client servi) ; erreur si aucune conversation n'a pu être servie. */
export type EscalationStatus = "en_attente" | "repondue" | "resolue" | "erreur" | "annulee";

/** État de la remise de la réponse à une conversation concernée. */
export type LinkDelivery =
  | "en_attente"
  | "envoyee"
  | "mode_humain"
  | "fenetre_fermee"
  | "echec";

export interface EscalationRow {
  id: number;
  waId: string;
  question: string;
  questionNorm: string;
  categorie: string;
  intention: string;
  sujet: string;
  statut: EscalationStatus;
  reponseJacob: string;
  entryId: number | null;
  notifiedVia: string;
  createdAt: number;
  resolvedAt: number | null;
  /** Photo du client jointe à la demande (nom de fichier archivé), vide sinon. */
  mediaFile: string;
  mediaMime: string;
  /** Contexte transmis avec la question (analyse de la photo, service en cours…). */
  contexte: string;
}

export interface EscalationLink {
  id: number;
  escalationId: number;
  waId: string;
  question: string;
  delivery: LinkDelivery;
  replyText: string;
  createdAt: number;
  deliveredAt: number | null;
}

/** Accès SQL brut minimal (identique à `RawDb` de db.ts, redéclaré pour éviter un import circulaire). */
interface Statement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes?: number; lastInsertRowid?: number | bigint } | unknown;
}
export interface KnowledgeDb {
  prepare(sql: string): Statement;
}

// ─── Concepts : « le même sens, formulé autrement » ─────────────────────────

/**
 * Petit lexique de concepts métier appliqué au texte NORMALISÉ (sans accent,
 * minuscules). Deux formulations qui activent les mêmes concepts parlent de la
 * même chose, même sans mot commun : « je peux payer en deux fois ? » /
 * « vous acceptez le paiement fractionné ? » / « 50 % maintenant et 50 %
 * après ? ». Éditable : ajouter un concept = ajouter une ligne.
 */
export const CONCEPTS: Array<{ id: string; re: RegExp; implies?: string[] }> = [
  {
    id: "paiement_fractionne",
    re: /\b(plusieurs fois|[2-9] fois|deux fois|trois fois|quatre fois|[2-9] ?x\b|en [2-9] x|fraction\w*|echelonn\w*|mensualit\w*|facilit\w* de paiement|paiement en plusieurs|payer en plusieurs|en plusieurs versements|versements?|50 ?%?\s*(maintenant|au depart|a la commande).*(apres|ensuite|a la fin|livraison)|acompte)\b/,
    implies: ["paiement"],
  },
  {
    id: "paiement",
    re: /\b(pay\w*|paiements?|regl\w*|virement|carte bancaire|cb|stripe|paypal|crypto|facture|encaiss\w*|moyens? de paiement|acompte)\b/,
  },
  {
    id: "delai",
    re: /\b(delais?|livraison|livre\w*|recevoir|combien de (temps|jours|semaines)|arriv\w*|duree|sous combien|en combien de temps|quand (est-ce|je))\b/,
  },
  {
    id: "prix",
    re: /\b(prix|tarifs?|cout\w*|combien (ca |cela )?(coute|fait|vaut|coûte)|cher|budget|euros?|€|devis)\b/,
  },
  {
    id: "remise",
    re: /\b(remises?|reductions?|rabais|promos?|promotions?|degressif\w*|moins cher|geste commercial|discount|tarif pro)\b/,
  },
  { id: "remboursement", re: /\b(rembours\w*|annul\w*|retractation|renvoyer|retour)\b/ },
  { id: "garantie", re: /\b(garanti\w*|sav|apres[- ]?vente|defectueu\w*|panne)\b/ },
  { id: "stock", re: /\b(stocks?|disponib\w*|en rayon|il vous reste|en magasin)\b/ },
  { id: "contact", re: /\b(contact\w*|appeler|rappel\w*|numero|telephone|parler a|joindre)\b/ },
  {
    id: "formation",
    re: /\b(formation\w*|modules?|cours|programme|apprendre|coaching|accompagnement)\b/,
  },
  { id: "fournisseur", re: /\b(fournisseurs?|agents?|usines?|sourcing|alibaba|chine|china)\b/ },
  { id: "recrutement", re: /\b(recrut\w*|emploi|employes?|poste|travailler|candidature|temps partiel)\b/ },
  { id: "societe", re: /\b(societe|llc|ltd|entreprise|siret|statut juridique|creation de societe)\b/ },
  { id: "livraison_pays", re: /\b(europe\w*|international|pays|douane\w*|expedi\w*)\b/ },
];

/** Concepts détectés dans un texte (normalisé en interne), implications comprises. */
export function conceptsOf(text: string): Set<string> {
  const n = normalizeText(text);
  const found = new Set<string>();
  for (const c of CONCEPTS) {
    if (c.re.test(n)) {
      found.add(c.id);
      for (const implied of c.implies ?? []) found.add(implied);
    }
  }
  return found;
}

const STOPWORDS = new Set(
  (
    "le la les un une des du de d l et ou a au aux en dans sur pour par avec sans ce cet cette ces " +
    "je tu il elle on nous vous ils elles me te se mon ma mes ton ta tes son sa ses notre votre vos " +
    "est es sont etre ai as avons avez ont avoir fait faire peut peux peuvent veux veut voudrais " +
    "que qui quoi quel quelle quels quelles ca cela c s n qu y ne pas plus pas non oui ok svp stp " +
    "bonjour salut merci cordialement si car mais donc or ni tres trop bien aussi comme"
  ).split(" "),
);

/** Radical grossier : suffit pour rapprocher pluriels et conjugaisons proches. */
function stem(word: string): string {
  let w = word;
  if (w.length > 5) w = w.replace(/(ements|ement|ations|ation|ateurs|ateur|ments|ment|euses|euse|eurs|eur|ions|ion|ables|able)$/, "");
  if (w.length > 4) w = w.replace(/(es|s|x|e)$/, "");
  return w;
}

export function contentTokens(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem)
    .filter((t) => t.length > 1);
}

function tokenSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const used = new Set<number>();
  let hits = 0;
  for (const ta of a) {
    let best = -1;
    for (let j = 0; j < b.length; j++) {
      if (used.has(j)) continue;
      const tb = b[j] as string;
      const close = ta === tb || (ta.length > 4 && tb.length > 4 && levenshtein(ta, tb) <= 1);
      if (close) {
        best = j;
        break;
      }
    }
    if (best >= 0) {
      used.add(best);
      hits++;
    }
  }
  return hits / Math.max(a.length, b.length, 1);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// ─── Rapprochement et niveau de confiance ───────────────────────────────────

export interface MatchContext {
  /** Service en cours dans la conversation (clé de la grille), s'il est connu. */
  serviceKey?: string | null;
  /** Libellé / texte de l'offre, pour le bonus de sujet. */
  extraText?: string;
}

export interface KnowledgeMatch {
  entry: KnowledgeEntry;
  /** 0..1 */
  score: number;
}

/** Textes comparables d'une entrée : l'intention canonique + les formulations vues. */
function entryTexts(entry: KnowledgeEntry): string[] {
  return [entry.intention, ...entry.variantes, entry.questionOrigine].filter((t) => t.trim().length > 0);
}

/**
 * Similarité entre une question de client et une entrée : 55 % concepts
 * (le SENS), 45 % mots (la lettre), bonus si le sujet/l'offre est mentionné,
 * malus si l'entrée vise une autre offre que celle en cours.
 */
export function scoreEntry(question: string, entry: KnowledgeEntry, ctx: MatchContext = {}): number {
  const qConcepts = conceptsOf(question);
  const qTokens = contentTokens(question);
  let best = 0;
  for (const text of entryTexts(entry)) {
    const eConcepts = conceptsOf(text);
    const conceptScore = jaccard(qConcepts, eConcepts);
    const tokenScore = tokenSimilarity(qTokens, contentTokens(text));
    // Aucun concept des deux côtés : le lexical porte seul, légèrement réduit.
    let s = qConcepts.size === 0 && eConcepts.size === 0 ? tokenScore * 0.9 : 0.55 * conceptScore + 0.45 * tokenScore;
    // Même ensemble de concepts (au moins deux, ex. paiement + fractionné) : même sujet, quelle que soit la formulation.
    if (conceptScore >= 0.99 && qConcepts.size >= 2) s = Math.max(s, 0.72);
    if (s > best) best = s;
  }
  // Le thème de l'entrée doit transparaître dans la question : « paiement »
  // dans une question sur le délai de livraison n'est pas une réponse.
  const themeConcepts = conceptsOf(entry.theme);
  if (themeConcepts.size > 0 && qConcepts.size > 0 && jaccard(themeConcepts, qConcepts) === 0) best *= 0.6;

  const hay = normalizeText(`${question} ${ctx.extraText ?? ""}`);
  const subject = normalizeText(entry.sujet);
  if (subject && subject.length > 2 && hay.includes(subject)) best = Math.min(1, best + 0.12);
  if (entry.offreCle && ctx.serviceKey) {
    if (entry.offreCle === ctx.serviceKey) best = Math.min(1, best + 0.1);
    else best *= 0.75;
  }
  return Math.round(best * 1000) / 1000;
}

export interface ConfidenceThresholds {
  /** ≥ : réponse automatique. */
  haut: number;
  /** ≥ (et < haut) : chercher davantage ; < : demander à Jacob. */
  bas: number;
}

export const DEFAULT_THRESHOLDS: ConfidenceThresholds = { haut: 0.7, bas: 0.4 };

export type ConfidenceLevel = "elevee" | "moyenne" | "faible";

export function confidenceLevel(score: number, t: ConfidenceThresholds = DEFAULT_THRESHOLDS): ConfidenceLevel {
  if (score >= t.haut) return "elevee";
  if (score >= t.bas) return "moyenne";
  return "faible";
}

export function bestMatches(
  entries: KnowledgeEntry[],
  question: string,
  ctx: MatchContext = {},
  limit = 5,
): KnowledgeMatch[] {
  return entries
    .map((entry) => ({ entry, score: scoreEntry(question, entry, ctx) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ─── Structuration de la réponse de Jacob (repli sans IA) ───────────────────

const CONDITION_RE =
  /(uniquement|seulement|a partir de|à partir de|au moins|minimum|maximum|jusqu'?a|jusqu'?à|sous reserve|sous réserve|si le client|a condition|à condition|sauf|excepte|excepté|hors |pas pour|pas avant|apres validation|après validation)/i;

/** Découpe en phrases (conserve les montants « 500,50 € »). */
function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface StructuredKnowledge {
  sujet: string;
  theme: string;
  categorie: string;
  offreCle: string;
  intention: string;
  reponse: string;
  conditions: string;
  exceptions: string;
  /** nouvelle | correction | precision */
  nature: "nouvelle" | "correction" | "precision";
  /** Faux quand la réponse ne vaut que pour CE cas (ex. « celui de la photo » sans article identifiable) : on répond au client mais on n'apprend rien. */
  memoriser?: boolean;
}

/** Libellé de thème à partir des concepts de la question. */
export function themeFromConcepts(concepts: Set<string>): string {
  const labels: Array<[string, string]> = [
    ["paiement_fractionne", "Paiement"],
    ["paiement", "Paiement"],
    ["delai", "Délais"],
    ["remise", "Remises"],
    ["prix", "Tarifs"],
    ["remboursement", "Remboursement"],
    ["garantie", "Garantie"],
    ["stock", "Disponibilité"],
    ["contact", "Contact"],
    ["formation", "Formation"],
    ["fournisseur", "Fournisseurs"],
    ["recrutement", "Recrutement"],
    ["societe", "Société"],
    ["livraison_pays", "Livraison internationale"],
  ];
  for (const [id, label] of labels) if (concepts.has(id)) return label;
  return "Général";
}

/**
 * Structuration déterministe : utilisée quand le LLM n'est pas disponible ou
 * renvoie un JSON inexploitable. Elle sépare la réponse métier des conditions
 * (jamais perdues : « uniquement à partir de 500 € » reste une condition).
 */
export function structureFallback(input: {
  question: string;
  reponseJacob: string;
  categorie?: string;
  sujet?: string;
  offreCle?: string;
  correction?: boolean;
}): StructuredKnowledge {
  const parts = sentences(input.reponseJacob);
  const conditionSentences = parts.filter((s) => CONDITION_RE.test(s));
  const main = parts.filter((s) => !CONDITION_RE.test(s));
  // Si TOUTE la réponse est conditionnelle, elle reste intacte comme réponse ET comme condition.
  const reponse = (main.length > 0 ? main : parts).join(" ").trim() || input.reponseJacob.trim();
  const conditions = conditionSentences.join(" ").trim();
  const concepts = conceptsOf(`${input.question} ${input.reponseJacob}`);
  return {
    sujet: input.sujet?.trim() || "",
    theme: themeFromConcepts(conceptsOf(input.question).size > 0 ? conceptsOf(input.question) : concepts),
    categorie: input.categorie?.trim() || "Autre",
    offreCle: input.offreCle?.trim() || "",
    intention: input.question.trim().replace(/\s+/g, " ").slice(0, 300),
    reponse,
    conditions,
    exceptions: "",
    nature: input.correction ? "correction" : "nouvelle",
  };
}

/** Parse tolérant du JSON renvoyé par le LLM (balises, texte autour, champs manquants). */
export function parseStructuredJson(raw: string): StructuredKnowledge | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const reponse = str(o.reponse);
    const intention = str(o.intention);
    if (!reponse || !intention) return null;
    const nature = str(o.nature);
    return {
      sujet: str(o.sujet).slice(0, 80),
      theme: str(o.theme).slice(0, 60),
      categorie: str(o.categorie).slice(0, 40) || "Autre",
      offreCle: str(o.offre_cle ?? o.offreCle).slice(0, 80),
      intention: intention.slice(0, 300),
      reponse: reponse.slice(0, 1200),
      conditions: str(o.conditions).slice(0, 600),
      exceptions: str(o.exceptions).slice(0, 600),
      nature: nature === "correction" || nature === "precision" ? nature : "nouvelle",
      memoriser: o.memoriser !== false && o.memoriser !== "false",
    };
  } catch {
    return null;
  }
}

/**
 * Une connaissance est PARTAGÉE entre tous les clients : elle ne doit jamais
 * contenir de donnée d'identité (téléphone, e-mail) ni de coordonnée de
 * paiement. Même filtre que l'apprentissage de style.
 */
const PHONE_RE = /(?:\+|00)\d[\d\s.-]{7,}\d|\b0[1-9](?:[\s.-]?\d{2}){4}\b/;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i;

export function knowledgeRejectReason(texts: string[]): string | null {
  const all = texts.join("\n");
  if (PAYMENT_OUTBOUND_RE.test(all)) return "coordonnée ou lien de paiement détecté";
  if (PHONE_RE.test(all)) return "numéro de téléphone détecté";
  if (EMAIL_RE.test(all)) return "adresse e-mail détectée";
  return null;
}

// ─── Contradictions ─────────────────────────────────────────────────────────

export type ConflictVerdict = "meme" | "precision" | "contradiction" | "distinct";

/** Valeurs numériques + unités d'un texte (« 10 jours », « 500 € »), pour repérer un changement de valeur. */
function quantities(text: string): string[] {
  const n = normalizeText(text);
  return [...n.matchAll(/(\d+(?:[.,]\d+)?)\s*(jours?|semaines?|mois|heures?|h|%|€|euros?|fois|x)?/g)].map((m) =>
    `${(m[1] as string).replace(",", ".")}${(m[2] ?? "").replace(/s$/, "").replace(/euro|€/, "eur")}`,
  );
}

/**
 * Verdict déterministe (repli sans IA) entre une connaissance existante et une
 * nouvelle réponse de Jacob sur la même question :
 *  - meme : même contenu (rien à changer) ;
 *  - precision : la nouvelle ajoute une condition/un détail sans changer les valeurs ;
 *  - contradiction : valeurs ou polarité différentes → la nouvelle REMPLACE ;
 *  - distinct : autre offre / autre sujet → on garde les deux.
 */
export function judgeConflictFallback(
  existing: KnowledgeEntry,
  incoming: StructuredKnowledge,
): ConflictVerdict {
  if (existing.offreCle && incoming.offreCle && existing.offreCle !== incoming.offreCle) return "distinct";
  const sujA = normalizeText(existing.sujet);
  const sujB = normalizeText(incoming.sujet);
  if (sujA && sujB && sujA !== sujB && !sujA.includes(sujB) && !sujB.includes(sujA)) return "distinct";

  const a = normalizeText(`${existing.reponse} ${existing.conditions}`);
  const b = normalizeText(`${incoming.reponse} ${incoming.conditions}`);
  if (a === b) return "meme";

  const qa = quantities(`${existing.reponse} ${existing.conditions}`);
  const qb = quantities(`${incoming.reponse} ${incoming.conditions}`);
  const valuesChanged = qa.length > 0 && qb.length > 0 && qa.join("|") !== qb.join("|");
  const NEG = /\b(non|pas|aucun|jamais|impossible|plus de|n'est plus|ne \w+ plus)\b/;
  const negA = NEG.test(a);
  const negB = NEG.test(b);
  if (incoming.nature === "correction" || valuesChanged || negA !== negB) return "contradiction";
  // Même polarité, mêmes valeurs : la nouvelle réponse apporte du détail.
  return "precision";
}

// ─── Messages ───────────────────────────────────────────────────────────────

/** Légende de la photo transmise à Jacob : la question, le client, le contexte, « réponds à ce message ». */
export function formatPhotoEscalationCaption(input: {
  clientLabel: string;
  categorie: string;
  question: string;
  contexte?: string;
}): string {
  const question = input.question.replace(/\s+/g, " ").trim().slice(0, 350);
  const ctx = (input.contexte ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
  return `🤖 ARBI JACOB — QUESTION CLIENT 📷

Le client demande :
“${question}”

Client : ${input.clientLabel}
Catégorie : ${input.categorie || "Autre"}${ctx ? `\nContexte : ${ctx}` : ""}

Réponds directement à ce message (texte ou vocal).
J'utiliserai ta réponse pour répondre au client et enrichir mes connaissances.`.slice(0, 1000);
}

export function formatEscalationMessage(input: { clientLabel: string; categorie: string; question: string; contexte?: string }): string {
  const question = input.question.replace(/\s+/g, " ").trim().slice(0, 500);
  return `🤖 ARBI JACOB — QUESTION CLIENT

J'ai besoin de ton aide sur une demande client.

Client :
${input.clientLabel}

Catégorie :
${input.categorie || "Autre"}

Question :
“${question}”${input.contexte?.trim() ? `\n\nContexte :\n${input.contexte.replace(/\s+/g, " ").trim().slice(0, 300)}` : ""}

Réponds simplement à ce message.
J'utiliserai ta réponse pour répondre au client et enrichir mes connaissances.`;
}

/** Section injectée dans le contexte DYNAMIQUE du bot (jamais dans le prompt statique mis en cache). */
export function formatKnowledgeForPrompt(matches: KnowledgeMatch[], thresholds: ConfidenceThresholds): string {
  if (matches.length === 0) {
    return [
      "# Connaissances validées par Jacob",
      "Aucune connaissance validée ne correspond à cette question. Cherche dans la grille, le catalogue et les documents. Si l'information factuelle est vraiment introuvable : outil ask_director (jamais d'invention).",
    ].join("\n");
  }
  const top = matches[0] as KnowledgeMatch;
  const level = confidenceLevel(top.score, thresholds);
  const header =
    level === "elevee"
      ? "Confiance ÉLEVÉE : une connaissance validée répond à cette question. Utilise-la directement, avec ses conditions, sans solliciter Jacob."
      : level === "moyenne"
        ? "Confiance MOYENNE : ces connaissances sont proches mais peut-être pas exactement la question. Vérifie qu'elles répondent vraiment ; complète avec la grille, le catalogue et les documents. N'appelle ask_director qu'en dernier recours."
        : "Confiance FAIBLE : rien de précis dans la base validée. Cherche dans la grille, le catalogue et les documents ; si l'information factuelle manque, appelle ask_director.";
  const lines = matches
    .filter((m) => m.score >= thresholds.bas * 0.75)
    .slice(0, level === "moyenne" ? 5 : 3)
    .map((m) => {
      const e = m.entry;
      const parts = [`- [${e.sujet || "Général"} · ${e.theme || "—"}] ${e.intention} → ${e.reponse}`];
      if (e.conditions) parts.push(`  Conditions (À RESPECTER, ne pas simplifier) : ${e.conditions}`);
      if (e.exceptions) parts.push(`  Exceptions : ${e.exceptions}`);
      return parts.join("\n");
    });
  return ["# Connaissances validées par Jacob (prioritaires sur tout le reste, sauf la grille pour les prix)", header, ...lines].join("\n");
}

// ─── Dépôt SQL ──────────────────────────────────────────────────────────────

interface EntryRaw {
  id: number;
  sujet: string;
  theme: string;
  categorie: string;
  offre_cle: string;
  intention: string;
  reponse: string;
  conditions: string;
  exceptions: string;
  variantes: string;
  source: string;
  statut: string;
  version: number;
  remplace_id: number | null;
  escalation_id: number | null;
  question_origine: string;
  reponse_jacob: string;
  created_at: number;
  updated_at: number;
}

function toEntry(r: EntryRaw): KnowledgeEntry {
  let variantes: string[] = [];
  try {
    const parsed = JSON.parse(r.variantes) as unknown;
    if (Array.isArray(parsed)) variantes = parsed.filter((v): v is string => typeof v === "string");
  } catch {
    variantes = [];
  }
  return {
    id: r.id,
    sujet: r.sujet,
    theme: r.theme,
    categorie: r.categorie,
    offreCle: r.offre_cle,
    intention: r.intention,
    reponse: r.reponse,
    conditions: r.conditions,
    exceptions: r.exceptions,
    variantes,
    source: r.source as KnowledgeSource,
    statut: r.statut as KnowledgeStatus,
    version: r.version,
    remplaceId: r.remplace_id,
    escalationId: r.escalation_id,
    questionOrigine: r.question_origine,
    reponseJacob: r.reponse_jacob,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface EscalationRaw {
  id: number;
  wa_id: string;
  question: string;
  question_norm: string;
  categorie: string;
  intention: string;
  sujet: string;
  statut: string;
  reponse_jacob: string;
  entry_id: number | null;
  notified_via: string;
  created_at: number;
  resolved_at: number | null;
  media_file: string | null;
  media_mime: string | null;
  contexte: string | null;
}

function toEscalation(r: EscalationRaw): EscalationRow {
  return {
    id: r.id,
    waId: r.wa_id,
    question: r.question,
    questionNorm: r.question_norm,
    categorie: r.categorie,
    intention: r.intention,
    sujet: r.sujet,
    statut: r.statut as EscalationStatus,
    reponseJacob: r.reponse_jacob,
    entryId: r.entry_id,
    notifiedVia: r.notified_via,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    mediaFile: r.media_file ?? "",
    mediaMime: r.media_mime ?? "",
    contexte: r.contexte ?? "",
  };
}

interface LinkRaw {
  id: number;
  escalation_id: number;
  wa_id: string;
  question: string;
  delivery: string;
  reply_text: string;
  created_at: number;
  delivered_at: number | null;
}

function toLink(r: LinkRaw): EscalationLink {
  return {
    id: r.id,
    escalationId: r.escalation_id,
    waId: r.wa_id,
    question: r.question,
    delivery: r.delivery as LinkDelivery,
    replyText: r.reply_text,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at,
  };
}

const SNAPSHOT_FIELDS: Array<keyof KnowledgeEntry> = [
  "sujet",
  "theme",
  "categorie",
  "offreCle",
  "intention",
  "reponse",
  "conditions",
  "exceptions",
  "statut",
  "version",
];

function snapshot(e: KnowledgeEntry): Partial<KnowledgeEntry> {
  const out: Record<string, unknown> = {};
  for (const k of SNAPSHOT_FIELDS) out[k] = e[k];
  return out as Partial<KnowledgeEntry>;
}

export function createKnowledge(db: KnowledgeDb, now: () => number = Date.now) {
  const lastId = (res: unknown): number => Number((res as { lastInsertRowid?: number | bigint }).lastInsertRowid ?? 0);

  function logHistory(
    entryId: number,
    action: KnowledgeHistoryAction,
    avant: Partial<KnowledgeEntry> | null,
    apres: Partial<KnowledgeEntry> | null,
    raison: string,
    source: string,
  ): void {
    db.prepare(
      `INSERT INTO knowledge_history (entry_id, action, avant, apres, raison, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(entryId, action, avant ? JSON.stringify(avant) : null, apres ? JSON.stringify(apres) : null, raison, source, now());
  }

  const entries = {
    get(id: number): KnowledgeEntry | undefined {
      const row = db.prepare(`SELECT * FROM knowledge_entries WHERE id = ?`).get(id) as EntryRaw | undefined;
      return row ? toEntry(row) : undefined;
    },
    /** Connaissances en vigueur (seules celles-ci alimentent le bot). */
    active(): KnowledgeEntry[] {
      return (db.prepare(`SELECT * FROM knowledge_entries WHERE statut = 'actif' ORDER BY id`).all() as EntryRaw[]).map(
        toEntry,
      );
    },
    /** Liste du journal, avec recherche plein texte simple et filtre de statut. */
    list(opts: { q?: string; statut?: KnowledgeStatus | "tous"; limit?: number } = {}): KnowledgeEntry[] {
      const rows = db
        .prepare(`SELECT * FROM knowledge_entries ORDER BY updated_at DESC, id DESC LIMIT ?`)
        .all(opts.limit ?? 500) as EntryRaw[];
      let list = rows.map(toEntry);
      if (opts.statut && opts.statut !== "tous") list = list.filter((e) => e.statut === opts.statut);
      const q = normalizeText(opts.q ?? "");
      if (q) {
        const words = q.split(" ").filter(Boolean);
        list = list.filter((e) => {
          const hay = normalizeText(
            [e.sujet, e.theme, e.categorie, e.intention, e.reponse, e.conditions, e.exceptions, e.questionOrigine, e.reponseJacob, e.variantes.join(" ")].join(" "),
          );
          return words.every((w) => hay.includes(w));
        });
      }
      return list;
    },
    add(input: KnowledgeInput, raison = "création"): number {
      const t = now();
      const res = db
        .prepare(
          `INSERT INTO knowledge_entries
             (sujet, theme, categorie, offre_cle, intention, reponse, conditions, exceptions, variantes,
              source, statut, version, remplace_id, escalation_id, question_origine, reponse_jacob, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'actif', 1, NULL, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.sujet ?? "",
          input.theme ?? "",
          input.categorie ?? "Autre",
          input.offreCle ?? "",
          input.intention,
          input.reponse,
          input.conditions ?? "",
          input.exceptions ?? "",
          JSON.stringify(input.variantes ?? []),
          input.source ?? "jacob",
          input.escalationId ?? null,
          input.questionOrigine ?? "",
          input.reponseJacob ?? "",
          t,
          t,
        );
      const id = lastId(res);
      const created = entries.get(id);
      logHistory(id, "creation", null, created ? snapshot(created) : null, raison, input.source ?? "jacob");
      return id;
    },
    /**
     * Met à jour une connaissance. L'ancienne valeur est TOUJOURS conservée
     * dans l'historique (valeur d'avant, valeur d'après, date, origine, raison).
     */
    update(
      id: number,
      patch: Partial<Pick<KnowledgeEntry, "sujet" | "theme" | "categorie" | "offreCle" | "intention" | "reponse" | "conditions" | "exceptions">>,
      meta: { action?: KnowledgeHistoryAction; source?: string; raison?: string } = {},
    ): boolean {
      const before = entries.get(id);
      if (!before) return false;
      const next = { ...before, ...patch };
      db.prepare(
        `UPDATE knowledge_entries
            SET sujet = ?, theme = ?, categorie = ?, offre_cle = ?, intention = ?, reponse = ?,
                conditions = ?, exceptions = ?, version = version + 1, updated_at = ?
          WHERE id = ?`,
      ).run(next.sujet, next.theme, next.categorie, next.offreCle, next.intention, next.reponse, next.conditions, next.exceptions, now(), id);
      const after = entries.get(id);
      logHistory(id, meta.action ?? "mise_a_jour", snapshot(before), after ? snapshot(after) : null, meta.raison ?? "", meta.source ?? "jacob");
      return true;
    },
    /** Rattache une formulation de client (sans doublon) : la connaissance reconnaît ensuite ce tour de phrase. */
    addVariant(id: number, text: string): void {
      const entry = entries.get(id);
      if (!entry) return;
      const clean = text.replace(/\s+/g, " ").trim().slice(0, 300);
      if (!clean) return;
      const known = new Set([entry.intention, ...entry.variantes].map((v) => normalizeText(v)));
      if (known.has(normalizeText(clean))) return;
      const variantes = [...entry.variantes, clean].slice(-12);
      db.prepare(`UPDATE knowledge_entries SET variantes = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(variantes),
        now(),
        id,
      );
    },
    /**
     * Remplace une connaissance par une nouvelle (contradiction) : l'ancienne
     * passe en « remplace », la nouvelle est créée et pointe vers elle.
     */
    replace(oldId: number, input: KnowledgeInput, raison: string): number {
      const old = entries.get(oldId);
      const newId = entries.add(input, raison);
      db.prepare(`UPDATE knowledge_entries SET remplace_id = ? WHERE id = ?`).run(oldId, newId);
      if (old) {
        db.prepare(`UPDATE knowledge_entries SET statut = 'remplace', updated_at = ? WHERE id = ?`).run(now(), oldId);
        const after = entries.get(newId);
        logHistory(oldId, "remplacement", snapshot(old), after ? snapshot(after) : null, raison, input.source ?? "jacob");
        logHistory(newId, "conflit", snapshot(old), after ? snapshot(after) : null, raison, input.source ?? "jacob");
      }
      return newId;
    },
    remove(id: number, source = "admin", raison = "suppression manuelle"): boolean {
      const before = entries.get(id);
      if (!before || before.statut === "supprime") return false;
      db.prepare(`UPDATE knowledge_entries SET statut = 'supprime', updated_at = ? WHERE id = ?`).run(now(), id);
      logHistory(id, "suppression", snapshot(before), null, raison, source);
      return true;
    },
    history(entryId: number): KnowledgeHistoryRow[] {
      const rows = db
        .prepare(`SELECT * FROM knowledge_history WHERE entry_id = ? ORDER BY id DESC`)
        .all(entryId) as Array<{
        id: number;
        entry_id: number;
        action: string;
        avant: string | null;
        apres: string | null;
        raison: string;
        source: string;
        created_at: number;
      }>;
      return rows.map((r) => ({
        id: r.id,
        entryId: r.entry_id,
        action: r.action as KnowledgeHistoryAction,
        avant: r.avant ? (JSON.parse(r.avant) as Partial<KnowledgeEntry>) : null,
        apres: r.apres ? (JSON.parse(r.apres) as Partial<KnowledgeEntry>) : null,
        raison: r.raison,
        source: r.source,
        createdAt: r.created_at,
      }));
    },
    /** Derniers conflits détectés / remplacements, pour le journal d'apprentissage. */
    recentConflicts(limit = 30): KnowledgeHistoryRow[] {
      const rows = db
        .prepare(`SELECT entry_id FROM knowledge_history WHERE action = 'conflit' ORDER BY id DESC LIMIT ?`)
        .all(limit) as Array<{ entry_id: number }>;
      const out: KnowledgeHistoryRow[] = [];
      for (const r of rows) {
        const h = entries.history(r.entry_id).find((x) => x.action === "conflit");
        if (h) out.push(h);
      }
      return out;
    },
    /** Empreinte des connaissances actives (invalide un cache de prompt éventuel). */
    stamp(): { n: number; m: number } {
      const row = db
        .prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS m FROM knowledge_entries WHERE statut = 'actif'`)
        .get() as { n: number; m: number };
      return row;
    },
    count(): number {
      return (db.prepare(`SELECT COUNT(*) AS n FROM knowledge_entries WHERE statut = 'actif'`).get() as { n: number }).n;
    },
  };

  const escalations = {
    get(id: number): EscalationRow | undefined {
      const row = db.prepare(`SELECT * FROM escalations WHERE id = ?`).get(id) as EscalationRaw | undefined;
      return row ? toEscalation(row) : undefined;
    },
    create(input: {
      waId: string;
      question: string;
      categorie?: string;
      intention?: string;
      sujet?: string;
      mediaFile?: string;
      mediaMime?: string;
      contexte?: string;
    }): number {
      const res = db
        .prepare(
          `INSERT INTO escalations (wa_id, question, question_norm, categorie, intention, sujet, statut, created_at, media_file, media_mime, contexte)
           VALUES (?, ?, ?, ?, ?, ?, 'en_attente', ?, ?, ?, ?)`,
        )
        .run(
          input.waId,
          input.question.slice(0, 600),
          normalizeText(input.question).slice(0, 400),
          input.categorie ?? "Autre",
          input.intention ?? "",
          input.sujet ?? "",
          now(),
          input.mediaFile ?? "",
          input.mediaMime ?? "",
          (input.contexte ?? "").slice(0, 800),
        );
      const id = lastId(res);
      escalations.link(id, input.waId, input.question);
      return id;
    },
    /** Rattache une conversation à une demande principale (déduplication). */
    link(escalationId: number, waId: string, question: string): number {
      const existing = db
        .prepare(`SELECT id FROM escalation_links WHERE escalation_id = ? AND wa_id = ?`)
        .get(escalationId, waId) as { id: number } | undefined;
      if (existing) return existing.id;
      const res = db
        .prepare(
          `INSERT INTO escalation_links (escalation_id, wa_id, question, delivery, reply_text, created_at)
           VALUES (?, ?, ?, 'en_attente', '', ?)`,
        )
        .run(escalationId, waId, question.slice(0, 600), now());
      return lastId(res);
    },
    links(escalationId: number): EscalationLink[] {
      return (
        db.prepare(`SELECT * FROM escalation_links WHERE escalation_id = ? ORDER BY id`).all(escalationId) as LinkRaw[]
      ).map(toLink);
    },
    open(): EscalationRow[] {
      return (
        db.prepare(`SELECT * FROM escalations WHERE statut = 'en_attente' ORDER BY id`).all() as EscalationRaw[]
      ).map(toEscalation);
    },
    countOpen(): number {
      return (db.prepare(`SELECT COUNT(*) AS n FROM escalations WHERE statut = 'en_attente'`).get() as { n: number }).n;
    },
    /** Demande en attente qui concerne CETTE conversation (principale ou rattachée). */
    openFor(waId: string): EscalationRow | undefined {
      const row = db
        .prepare(
          `SELECT e.* FROM escalations e
             JOIN escalation_links l ON l.escalation_id = e.id
            WHERE e.statut = 'en_attente' AND l.wa_id = ?
            ORDER BY e.id DESC LIMIT 1`,
        )
        .get(waId) as EscalationRaw | undefined;
      return row ? toEscalation(row) : undefined;
    },
    /** Dernière demande RÉSOLUE qui concernait cette conversation (trace « 🟢 résolu par Jacob »). */
    latestResolvedFor(waId: string): EscalationRow | undefined {
      const row = db
        .prepare(
          `SELECT e.* FROM escalations e
             JOIN escalation_links l ON l.escalation_id = e.id
            WHERE e.statut IN ('resolue','repondue','erreur') AND l.wa_id = ?
            ORDER BY e.resolved_at DESC, e.id DESC LIMIT 1`,
        )
        .get(waId) as EscalationRaw | undefined;
      return row ? toEscalation(row) : undefined;
    },
    /**
     * Demande déjà ouverte qui porte (presque) sur la même question : évite
     * d'envoyer dix messages identiques à Jacob.
     */
    findOpenSimilar(question: string, ctx: MatchContext = {}, minScore = 0.62): EscalationRow | undefined {
      const probe = (e: EscalationRow): number =>
        scoreEntry(question, pseudoEntry(e.question, e.sujet), ctx);
      let best: { row: EscalationRow; score: number } | undefined;
      for (const row of escalations.open()) {
        const score = probe(row);
        if (score >= minScore && (!best || score > best.score)) best = { row, score };
      }
      return best?.row;
    },
    addMessage(escalationId: number, adminWaId: string, wamid: string | null): void {
      db.prepare(
        `INSERT INTO escalation_messages (escalation_id, admin_wa_id, wamid, created_at) VALUES (?, ?, ?, ?)`,
      ).run(escalationId, adminWaId, wamid, now());
    },
    byWamid(wamid: string): EscalationRow | undefined {
      const row = db
        .prepare(
          `SELECT e.* FROM escalations e JOIN escalation_messages m ON m.escalation_id = e.id
            WHERE m.wamid = ? ORDER BY m.id DESC LIMIT 1`,
        )
        .get(wamid) as EscalationRaw | undefined;
      return row ? toEscalation(row) : undefined;
    },
    setNotifiedVia(id: number, via: string): void {
      db.prepare(`UPDATE escalations SET notified_via = ? WHERE id = ?`).run(via, id);
    },
    /** La réponse de Jacob est RELIÉE à cette demande (pas encore forcément remise au client). */
    markAnswered(id: number, input: { reponseJacob: string; entryId: number | null }): void {
      db.prepare(`UPDATE escalations SET statut = 'repondue', reponse_jacob = ?, entry_id = ? WHERE id = ?`).run(
        input.reponseJacob.slice(0, 2000),
        input.entryId,
        id,
      );
    },
    /** Aucune conversation n'a pu être servie (client injoignable, envoi refusé…). */
    fail(id: number): void {
      db.prepare(`UPDATE escalations SET statut = 'erreur', resolved_at = ? WHERE id = ?`).run(now(), id);
    },
    /** Demandes terminées (traitées, répondues, en erreur) pour le journal. */
    closed(limit = 50): EscalationRow[] {
      return (
        db
          .prepare(`SELECT * FROM escalations WHERE statut IN ('resolue','repondue','erreur') ORDER BY id DESC LIMIT ?`)
          .all(limit) as EscalationRaw[]
      ).map(toEscalation);
    },
    resolve(id: number, input: { reponseJacob: string; entryId: number | null }): void {
      db.prepare(
        `UPDATE escalations SET statut = 'resolue', reponse_jacob = ?, entry_id = ?, resolved_at = ? WHERE id = ?`,
      ).run(input.reponseJacob.slice(0, 2000), input.entryId, now(), id);
    },
    cancel(id: number): void {
      db.prepare(`UPDATE escalations SET statut = 'annulee', resolved_at = ? WHERE id = ?`).run(now(), id);
    },
    markDelivery(linkId: number, delivery: LinkDelivery, replyText = ""): void {
      db.prepare(`UPDATE escalation_links SET delivery = ?, reply_text = ?, delivered_at = ? WHERE id = ?`).run(
        delivery,
        replyText.slice(0, 2000),
        now(),
        linkId,
      );
    },
    list(opts: { statut?: EscalationStatus | "toutes"; limit?: number } = {}): EscalationRow[] {
      const where = opts.statut && opts.statut !== "toutes" ? `WHERE statut = '${opts.statut}'` : "";
      return (
        db.prepare(`SELECT * FROM escalations ${where} ORDER BY id DESC LIMIT ?`).all(opts.limit ?? 100) as EscalationRaw[]
      ).map(toEscalation);
    },
  };

  return { entries, escalations };
}

export type KnowledgeRepos = ReturnType<typeof createKnowledge>;

/** Entrée factice pour comparer une question à une autre question (déduplication d'escalades). */
function pseudoEntry(question: string, sujet: string): KnowledgeEntry {
  return {
    id: 0,
    sujet,
    theme: "",
    categorie: "",
    offreCle: "",
    intention: question,
    reponse: "",
    conditions: "",
    exceptions: "",
    variantes: [],
    source: "jacob",
    statut: "actif",
    version: 1,
    remplaceId: null,
    escalationId: null,
    questionOrigine: "",
    reponseJacob: "",
    createdAt: 0,
    updatedAt: 0,
  };
}
