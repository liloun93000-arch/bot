import { FINE_CATEGORIES } from "./categories";
import type { Core } from "./db";

/**
 * Analyse & Suggestions : agrégats calculés UNIQUEMENT à partir des données réelles (messages clients,
 * questions, fiches, historique de statuts). Aucun appel IA ici, aucune valeur inventée : sans donnée,
 * aucune suggestion. Les suggestions ne modifient JAMAIS le catalogue ni les tarifs.
 */
export const ANALYSIS_TZ = "Europe/Paris";
const DAY = 86_400_000;

export type PeriodPreset = "today" | "yesterday" | "7d" | "30d" | "custom";
export interface Period {
  preset: PeriodPreset;
  from: number;
  /** Exclusif. */
  to: number;
  label: string;
}

function tzOffsetMs(ts: number, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(new Date(ts));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(ts / 1000) * 1000;
}

/** Début (minuit local) du jour contenant `ts`, dans le fuseau demandé. */
export function startOfDay(ts: number, tz = ANALYSIS_TZ): number {
  const off = tzOffsetMs(ts, tz);
  const localMid = Math.floor((ts + off) / DAY) * DAY;
  let guess = localMid - off;
  guess = localMid - tzOffsetMs(guess, tz); // corrige un éventuel changement d'heure dans la journée
  return guess;
}

const ymd = /^(\d{4})-(\d{2})-(\d{2})$/;

export function resolvePeriod(preset: string, from?: string, to?: string, now = Date.now(), tz = ANALYSIS_TZ): Period {
  const today = startOfDay(now, tz);
  switch (preset) {
    case "yesterday":
      return { preset: "yesterday", from: startOfDay(today - 1, tz), to: today, label: "Hier" };
    case "7d":
      return { preset: "7d", from: startOfDay(today - 6 * DAY, tz), to: now + 1, label: "7 derniers jours" };
    case "30d":
      return { preset: "30d", from: startOfDay(today - 29 * DAY, tz), to: now + 1, label: "30 derniers jours" };
    case "custom": {
      const a = from && ymd.exec(from);
      const b = to && ymd.exec(to);
      if (a && b) {
        const f = startOfDay(Date.UTC(+a[1]!, +a[2]! - 1, +a[3]!, 12), tz);
        const t = startOfDay(Date.UTC(+b[1]!, +b[2]! - 1, +b[3]!, 12), tz) + DAY;
        if (t > f) return { preset: "custom", from: f, to: Math.min(t, now + 1), label: `Du ${from} au ${to}` };
      }
      break;
    }
  }
  return { preset: "today", from: today, to: now + 1, label: "Aujourd'hui" };
}

// ── Thématiques ──

type Group = "service" | "formation" | "fournisseur" | "produit" | "autre";
interface Topic { label: string; group: Group; re: RegExp }

/** Thématiques propres à ARBI JACOB, testées avant les catégories fines (China Access). */
const EXTRA_TOPICS: Topic[] = [
  { label: "LLC américaine", group: "service", re: /\bllc\b|societe americaine|wyoming|new ?mexico|\bein\b/i },
  { label: "LTD Hong Kong / UK", group: "service", re: /\bltd\b|hong ?kong|\bhk\b|societe (?:a )?hong|company (?:limited|formation)|royaume/i },
  { label: "Applications / bots / IA", group: "service", re: /\b(app(?:lication)?s?|mvp|saas|bot|chatbot|automatis\w*|\bia\b|intelligence artificielle|agent ia|logiciel)\b/i },
  { label: "Boutique / e-commerce", group: "service", re: /\b(e-?commerce|shopify|dropshipping|woocommerce|boutique en ligne)\b/i },
  { label: "Marque / branding", group: "service", re: /\b(branding|marque|identite visuelle|packaging|charte graphique)\b/i },
];
const GROUP_OF: Record<string, Group> = {
  "Formation China Access": "formation", "Trafic Pro": "formation", Vinted: "formation",
  Agents: "fournisseur", "Fournisseurs (accès)": "fournisseur",
  "FRS iPhone / Apple": "produit", Volants: "produit", "Surron / véhicules électriques": "produit", "Drones DJI": "produit",
  Starlink: "produit", NFC: "produit", "Snapchat (comptes)": "produit", "Produit à l'unité (revendeur)": "produit",
  "Sites / Ghost Studio": "service",
};
const TOPICS: Topic[] = [
  ...EXTRA_TOPICS,
  ...FINE_CATEGORIES.map((c) => ({ label: c.label, group: GROUP_OF[c.label] ?? ("autre" as Group), re: c.re })),
];

function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Thématique d'un message client (ou null). */
export function topicOf(text: string): Topic | null {
  const t = plain(text);
  for (const topic of TOPICS) if (topic.re.test(text) || topic.re.test(t)) return topic;
  return null;
}

// ── Objections et difficultés (déclarées par les clients eux-mêmes) ──

const OBJECTION_TYPES: Array<{ id: string; label: string; re: RegExp }> = [
  { id: "prix", label: "Prix jugé trop élevé / budget", re: /\b(trop cher|c est cher|tres cher|moins cher|trop elev|hors budget|pas (?:le|mon) budget|pas les moyens|budget (?:limite|serre)|reduction|remise|promo|negoci\w*|baisser le prix|derniere prix|dernier prix)\b/ },
  { id: "confiance", label: "Manque de confiance / peur de l'arnaque", re: /\b(arnaque|arnaqu\w+|fiable|confiance|garantie|preuve|avis clients?|est-?ce serieux|serieux)\b/ },
  { id: "difference_formules", label: "Doute entre deux offres / formules", re: /\b(difference entre|quelle difference|lequel choisir|quelle formule|basique ou|prestige ou|ultime ou|je (?:sais|sait) pas (?:quelle|laquelle|lequel))\b/ },
  { id: "delai", label: "Délai jugé trop long", re: /\b(trop long|trop de temps|delai trop|ca prend combien|pas le temps)\b/ },
  { id: "complexite", label: "Démarche jugée compliquée", re: /\b(complique|compliquee|trop complexe|j y comprends rien|je comprends pas|comprends rien|pas clair)\b/ },
  { id: "reflexion", label: "Veut réfléchir / décide plus tard", re: /\b(je reflechis|laisse moi reflechir|je vais reflechir|plus tard|je reviens vers vous|je vous recontacte|je te recontacte|pas maintenant)\b/ },
];
const DIFFICULTE_RE =
  /\b(j arrive pas|je n arrive pas|n arrive pas|ca marche pas|ca ne marche pas|bloque|erreur|bug|probleme|impossible|refuse|refusee?|rejete|pas recu|jamais recu)\b/;

export interface Exemple { waId: string; nom: string | null; ts: number; extrait: string }
export interface Insight {
  id: string;
  label: string;
  nbClients: number;
  nbMessages: number;
  /** Clients de la période précédente de même durée (pour la tendance), si calculé. */
  precedent?: number;
  exemples: Exemple[];
}

export interface OffreStat { offre: string; fiches: number; devis: number; gagnees: number; perdues: number }
export interface Suggestion {
  id: string;
  categorie: "contenu" | "offre" | "discours" | "conversion" | "fournisseur" | "formation" | "promo";
  titre: string;
  texte: string;
  nbClients: number;
  exemples: Exemple[];
}

export interface Analysis {
  period: Period;
  clientsActifs: number;
  messagesClients: number;
  services: Insight[];
  formations: Insight[];
  fournisseurs: Insight[];
  produits: Insight[];
  tendances: Array<Insight & { evolution: "nouveau" | "hausse" }>;
  sansOffre: Insight[];
  objections: Insight[];
  difficultes: Insight[];
  raisonsNonAchat: Insight[];
  interetSansVente: OffreStat[];
  offres: OffreStat[];
  suggestions: Suggestion[];
}

interface MsgRow { wa_id: string; contenu: string; ts: number; nom: string | null }

function messages(core: Core, from: number, to: number): MsgRow[] {
  return core.sqlite
    .prepare(
      `SELECT m.wa_id, m.contenu, m.ts, c.nom FROM messages m LEFT JOIN contacts c ON c.wa_id = m.wa_id
       WHERE m.role = 'user' AND m.ts >= ? AND m.ts < ? AND m.contenu NOT LIKE '[%' ORDER BY m.ts`,
    )
    .all(from, to) as MsgRow[];
}

const snippet = (t: string) => (t.length > 160 ? `${t.slice(0, 157)}…` : t);

/** Regroupe des messages par clé : clients DISTINCTS, messages, exemples (un par client, plus récents d'abord, max 5). */
function group(rows: Array<{ key: string; m: MsgRow }>): Map<string, { clients: Map<string, MsgRow>; messages: number }> {
  const out = new Map<string, { clients: Map<string, MsgRow>; messages: number }>();
  for (const { key, m } of rows) {
    const g = out.get(key) ?? { clients: new Map(), messages: 0 };
    g.messages++;
    g.clients.set(m.wa_id, m);
    out.set(key, g);
  }
  return out;
}

function toInsights(map: Map<string, { clients: Map<string, MsgRow>; messages: number }>, idPrefix: string, labelOf: (k: string) => string = (k) => k): Insight[] {
  return [...map.entries()]
    .map(([key, g]) => ({
      id: `${idPrefix}:${key}`,
      label: labelOf(key),
      nbClients: g.clients.size,
      nbMessages: g.messages,
      exemples: [...g.clients.values()]
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 5)
        .map((m) => ({ waId: m.wa_id, nom: m.nom, ts: m.ts, extrait: snippet(m.contenu) })),
    }))
    .sort((a, b) => b.nbClients - a.nbClients || b.nbMessages - a.nbMessages);
}

function topicRows(rows: MsgRow[]): Array<{ key: string; group: Group; m: MsgRow }> {
  const out: Array<{ key: string; group: Group; m: MsgRow }> = [];
  for (const m of rows) {
    if (m.contenu.length < 4) continue;
    const t = topicOf(m.contenu);
    if (t) out.push({ key: t.label, group: t.group, m });
  }
  return out;
}

const MIN_CLIENTS = 2;

export function analyze(core: Core, period: Period, now = Date.now()): Analysis {
  const rows = messages(core, period.from, period.to);
  const span = period.to - period.from;
  const prevRows = messages(core, period.from - span, period.from);

  const cur = topicRows(rows);
  const prev = topicRows(prevRows);
  const byGroup = (g: Group) => toInsights(group(cur.filter((r) => r.group === g)), g);
  const prevCount = new Map<string, number>();
  for (const [k, v] of group(prev.map((r) => ({ key: r.key, m: r.m })))) prevCount.set(k, v.clients.size);
  const allTopics = toInsights(group(cur), "topic");

  const tendances = allTopics
    .map((i) => {
      const before = prevCount.get(i.label) ?? 0;
      const evolution: "nouveau" | "hausse" | null =
        before === 0 ? "nouveau" : i.nbClients >= before * 1.5 && i.nbClients - before >= 2 ? "hausse" : null;
      return evolution && i.nbClients >= 3 ? [{ ...i, precedent: before, evolution }] : [];
    })
    .flat();

  // Objections et difficultés EXPRIMÉES par les clients (jamais déduites).
  const obj: Array<{ key: string; m: MsgRow }> = [];
  const dif: Array<{ key: string; m: MsgRow }> = [];
  for (const m of rows) {
    const t = plain(m.contenu);
    for (const o of OBJECTION_TYPES) if (o.re.test(t)) obj.push({ key: o.id, m });
    if (DIFFICULTE_RE.test(t)) dif.push({ key: "difficulte", m });
  }
  const objLabel = (k: string) => OBJECTION_TYPES.find((o) => o.id === k)?.label ?? k;
  const objections = toInsights(group(obj), "objection", objLabel);
  const difficultes = toInsights(group(dif), "difficulte", () => "Difficultés rencontrées (problème, blocage, refus…)");

  // Demandes sans réponse / sans offre : questions que le bot n'a pas su traiter.
  const unans = core.sqlite
    .prepare(
      `SELECT q.wa_id, q.texte, q.created_at AS ts, q.categorie, c.nom FROM questions q LEFT JOIN contacts c ON c.wa_id = q.wa_id
       WHERE q.repondue = 0 AND q.created_at >= ? AND q.created_at < ?`,
    )
    .all(period.from, period.to) as Array<{ wa_id: string; texte: string; ts: number; categorie: string; nom: string | null }>;
  const sansOffre = toInsights(
    group(unans.map((u) => ({ key: topicOf(u.texte)?.label ?? (u.categorie && u.categorie !== "Autre" ? u.categorie : "Autres demandes sans réponse"), m: { wa_id: u.wa_id, contenu: u.texte, ts: u.ts, nom: u.nom } }))),
    "sans_offre",
  );

  // Fiches : intérêt réel vs ventes, par offre.
  const leadRows = core.sqlite
    .prepare(`SELECT offre, statut FROM leads WHERE ts >= ? AND ts < ?`)
    .all(period.from, period.to) as Array<{ offre: string; statut: string }>;
  const stat = new Map<string, OffreStat>();
  for (const l of leadRows) {
    const s = stat.get(l.offre) ?? { offre: l.offre, fiches: 0, devis: 0, gagnees: 0, perdues: 0 };
    s.fiches++;
    if (l.statut === "devis_envoye") s.devis++;
    if (l.statut === "gagne") s.gagnees++;
    if (l.statut === "perdu") s.perdues++;
    stat.set(l.offre, s);
  }
  const offres = [...stat.values()].sort((a, b) => b.fiches - a.fiches);
  const interetSansVente = offres.filter((o) => o.fiches >= 3 && o.gagnees / o.fiches < 0.2);

  // Raisons de non-achat : uniquement des fiches PERDUES avec un élément déclencheur écrit par le client.
  const lost = core.sqlite
    .prepare(
      `SELECT h.wa_id, h.preuve, h.ts, c.nom FROM lead_status_history h LEFT JOIN contacts c ON c.wa_id = h.wa_id
       WHERE h.nouveau = 'perdu' AND h.ts >= ? AND h.ts < ? AND h.preuve <> ''`,
    )
    .all(period.from, period.to) as Array<{ wa_id: string; preuve: string; ts: number; nom: string | null }>;
  const reasons: Array<{ key: string; m: MsgRow }> = [];
  for (const l of lost) {
    const m = { wa_id: l.wa_id, contenu: l.preuve, ts: l.ts, nom: l.nom };
    const t = plain(l.preuve);
    const matched = OBJECTION_TYPES.filter((o) => o.id !== "reflexion" && o.re.test(t));
    if (matched.length === 0) reasons.push({ key: "autre", m });
    else for (const o of matched) reasons.push({ key: o.id, m });
  }
  const raisonsNonAchat = toInsights(group(reasons), "non_achat", (k) => (k === "autre" ? "Autre raison exprimée (voir les messages)" : objLabel(k)));

  const clientsActifs = new Set(rows.map((r) => r.wa_id)).size;
  const result: Analysis = {
    period, clientsActifs, messagesClients: rows.length,
    services: byGroup("service"), formations: byGroup("formation"), fournisseurs: byGroup("fournisseur"), produits: byGroup("produit"),
    tendances, sansOffre, objections, difficultes, raisonsNonAchat, interetSansVente, offres, suggestions: [],
  };
  result.suggestions = buildSuggestions(result);
  void now;
  return result;
}

// ── Suggestions (modèles déterministes, uniquement à partir des chiffres réels ci-dessus) ──

const plural = (n: number, s: string, p: string) => (n > 1 ? p : s);

export function buildSuggestions(a: Analysis): Suggestion[] {
  const out: Suggestion[] = [];
  const periode = a.period.label.toLowerCase();
  const push = (s: Suggestion) => out.push(s);

  for (const i of [...a.services, ...a.formations, ...a.produits].slice(0, 12)) {
    if (i.nbClients < MIN_CLIENTS) continue;
    const isFormation = a.formations.some((f) => f.id === i.id);
    push({
      id: `contenu:${i.label}`,
      categorie: isFormation ? "formation" : "contenu",
      titre: `${i.label} : sujet très demandé`,
      texte:
        `${i.nbClients} ${plural(i.nbClients, "client a", "clients ont")} abordé « ${i.label} » (${periode}). ` +
        `Idée : une vidéo TikTok ou une story Snapchat qui répond aux questions les plus posées sur ce sujet` +
        (isFormation ? ", et vérifier que le contenu de la formation répond bien à ces attentes." : ", puis la partager aux prospects qui posent la question."),
      nbClients: i.nbClients,
      exemples: i.exemples,
    });
  }
  for (const i of a.fournisseurs) {
    if (i.nbClients < MIN_CLIENTS) continue;
    push({
      id: `fournisseur:${i.label}`, categorie: "fournisseur", titre: `Recherche de fournisseurs : ${i.label}`,
      texte: `${i.nbClients} ${plural(i.nbClients, "client cherche", "clients cherchent")} un fournisseur ou un accès (« ${i.label} », ${periode}). Piste : identifier de nouveaux fournisseurs dans cette catégorie, à valider avant toute promesse aux clients.`,
      nbClients: i.nbClients, exemples: i.exemples,
    });
  }
  for (const i of a.sansOffre) {
    if (i.nbClients < MIN_CLIENTS) continue;
    push({
      id: `offre:${i.label}`, categorie: "offre", titre: `Demande récurrente sans réponse : ${i.label}`,
      texte: `${i.nbClients} ${plural(i.nbClients, "client a posé", "clients ont posé")} une question restée sans réponse sur « ${i.label} » (${periode}). Piste : enrichir le catalogue ou créer une offre pour répondre à ce besoin (décision et prix : toi).`,
      nbClients: i.nbClients, exemples: i.exemples,
    });
  }
  for (const i of a.objections) {
    if (i.nbClients < MIN_CLIENTS) continue;
    const base = `${i.nbClients} ${plural(i.nbClients, "client a exprimé", "clients ont exprimé")} l'objection « ${i.label} » (${periode}).`;
    const idee: Record<string, string> = {
      prix: "Piste : mieux détailler ce qui est inclus avant d'annoncer le prix, ou réfléchir à une offre d'entrée ou à une promotion ciblée. Aucun tarif n'est modifié automatiquement.",
      confiance: "Piste : mettre en avant des preuves réelles (réalisations, avis vérifiables, processus clair).",
      difference_formules: "Piste : clarifier la différence entre les formules dans le discours commercial (tableau simple des prestations incluses).",
      delai: "Piste : annoncer clairement les délais réels et les étapes.",
      complexite: "Piste : simplifier l'explication, avec des étapes numérotées et un exemple concret.",
      reflexion: "Piste : proposer une relance douce avec une information utile plutôt qu'une pression.",
    };
    const id = i.id.split(":")[1] ?? "";
    push({ id: `discours:${id}`, categorie: id === "prix" ? "promo" : "discours", titre: `Objection fréquente : ${i.label}`, texte: `${base} ${idee[id] ?? ""}`.trim(), nbClients: i.nbClients, exemples: i.exemples });
  }
  for (const o of a.interetSansVente) {
    push({
      id: `conversion:${o.offre}`, categorie: "conversion", titre: `Beaucoup d'intérêt, peu de ventes : ${o.offre}`,
      texte: `${o.fiches} fiches « ${o.offre} » (${periode}), dont ${o.gagnees} gagnée${o.gagnees > 1 ? "s" : ""}, ${o.devis} avec devis envoyé et ${o.perdues} perdue${o.perdues > 1 ? "s" : ""}. Piste : relire les conversations de ces clients pour identifier ce qui bloque, puis ajuster le discours ou l'offre.`,
      nbClients: o.fiches, exemples: [],
    });
  }
  for (const t of a.tendances) {
    push({
      id: `tendance:${t.label}`, categorie: "contenu", titre: `Tendance : ${t.label}`,
      texte: t.evolution === "nouveau"
        ? `« ${t.label} » apparaît cette période (${t.nbClients} clients) alors qu'aucun client n'en parlait sur la période précédente de même durée.`
        : `« ${t.label} » progresse : ${t.nbClients} clients contre ${t.precedent ?? 0} sur la période précédente de même durée.`,
      nbClients: t.nbClients, exemples: t.exemples,
    });
  }
  return out.sort((a, b) => b.nbClients - a.nbClients);
}

/** Entrée de l'IA pour des idées rédigées (TikTok, Snapchat, formations…) : chiffres réels uniquement, aucune donnée personnelle. */
export function aiIdeasPrompt(a: Analysis): { system: string; user: string } {
  const lines = (title: string, items: Array<{ label: string; nbClients: number }>) =>
    items.length ? `${title}\n${items.slice(0, 8).map((i) => `- ${i.label} : ${i.nbClients} client(s)`).join("\n")}` : "";
  const quotes = a.suggestions.slice(0, 6).flatMap((s) => s.exemples.slice(0, 2).map((e) => `- « ${e.extrait.replace(/\d{6,}/g, "…")} »`));
  const data = [
    `Période : ${a.period.label} — ${a.clientsActifs} clients actifs, ${a.messagesClients} messages.`,
    lines("Services demandés", a.services), lines("Formations demandées", a.formations), lines("Fournisseurs recherchés", a.fournisseurs),
    lines("Produits demandés", a.produits), lines("Demandes sans réponse", a.sansOffre), lines("Objections", a.objections),
    lines("Difficultés", a.difficultes), lines("Raisons de non-achat exprimées", a.raisonsNonAchat),
    a.interetSansVente.length ? `Offres à fort intérêt mais peu de ventes\n${a.interetSansVente.map((o) => `- ${o.offre} : ${o.fiches} fiches, ${o.gagnees} gagnées`).join("\n")}` : "",
    quotes.length ? `Extraits anonymes de messages clients\n${quotes.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  return {
    system:
      "Tu aides le fondateur d'ARBI JACOB (services digitaux, sociétés LLC/LTD, formations et accès fournisseurs Chine) à développer son activité. " +
      "Tu reçois des chiffres RÉELS issus des conversations clients. Propose des idées concrètes : sujets de vidéos TikTok, thèmes de stories Snapchat, nouvelles formations ou fournisseurs à rechercher, idées de promotions, améliorations du discours commercial et de la conversion. " +
      "RÈGLES : appuie chaque idée sur un chiffre fourni (cite-le) ; n'invente AUCUN chiffre, tendance ou motif ; ne propose jamais de modifier un prix ou le catalogue sans validation humaine (présente-le comme une option à étudier) ; " +
      "si les données sont insuffisantes, dis-le simplement. Réponds en français, en 6 à 10 puces courtes, sans préambule.",
    user: a.messagesClients === 0 ? "Aucune donnée sur la période." : data,
  };
}
