import type { Core } from "./db";

/**
 * Base de connaissances structurée (LLC / LTD Hong Kong, extensible à d'autres domaines).
 *
 * Elle est PARTAGÉE : le manager principal et les futurs agents spécialisés (ex. Telegram LLC/LTD)
 * lisent et enrichissent la même table, sans reconstruire quoi que ce soit (champ `origine`).
 * Chaque connaissance garde : titre, contenu, catégorie, juridiction, source (+ lien), date de
 * vérification, version, conditions, fiabilité, statut actif/obsolète.
 *
 * Distinction nette :
 *  - nature « reglementaire » : issue d'une autorité (IRS, FinCEN, Companies Registry…) ;
 *  - nature « commercial »    : validée par Jacob (offres, prix). JAMAIS modifiée automatiquement.
 *
 * Recherche : lexicale pondérée (titre > catégorie > contenu), sans appel IA ni crédit ;
 * seuls les extraits pertinents, dans un budget de caractères, sont transmis à l'IA.
 */
export type KbNature = "reglementaire" | "commercial" | "interne";
export type KbFiabilite = "officielle_verifiee" | "validee_jacob" | "a_verifier" | "interne";
export type KbStatut = "actif" | "obsolete";

export interface KbDoc {
  id: number;
  slug: string;
  titre: string;
  contenu: string;
  categorie: string;
  juridiction: string;
  nature: KbNature;
  source: string;
  sourceUrl: string;
  verifieLe: number | null;
  version: number;
  conditions: string;
  fiabilite: KbFiabilite;
  statut: KbStatut;
  revueJours: number;
  visibleClient: boolean;
  origine: string;
  modifieHumain: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface KbInput {
  slug: string;
  titre: string;
  contenu: string;
  categorie: string;
  juridiction?: string;
  nature?: KbNature;
  source?: string;
  sourceUrl?: string;
  verifieLe?: number | null;
  conditions?: string;
  fiabilite?: KbFiabilite;
  revueJours?: number;
  visibleClient?: boolean;
  origine?: string;
}

interface Row {
  id: number; slug: string; titre: string; contenu: string; categorie: string; juridiction: string; nature: string;
  source: string; source_url: string; verifie_le: number | null; version: number; conditions: string; fiabilite: string;
  statut: string; revue_jours: number; visible_client: number; origine: string; modifie_humain: number;
  created_at: number; updated_at: number;
}

const toDoc = (r: Row): KbDoc => ({
  id: r.id, slug: r.slug, titre: r.titre, contenu: r.contenu, categorie: r.categorie, juridiction: r.juridiction,
  nature: r.nature as KbNature, source: r.source, sourceUrl: r.source_url, verifieLe: r.verifie_le, version: r.version,
  conditions: r.conditions, fiabilite: r.fiabilite as KbFiabilite, statut: r.statut as KbStatut, revueJours: r.revue_jours,
  visibleClient: r.visible_client === 1, origine: r.origine, modifieHumain: r.modifie_humain === 1,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

export function kbGet(core: Core, id: number): KbDoc | null {
  const r = core.sqlite.prepare(`SELECT * FROM kb_docs WHERE id = ?`).get(id) as Row | undefined;
  return r ? toDoc(r) : null;
}

export function kbList(core: Core, opts: { statut?: KbStatut; categorie?: string } = {}): KbDoc[] {
  const rows = core.sqlite
    .prepare(`SELECT * FROM kb_docs WHERE (? = '' OR statut = ?) AND (? = '' OR categorie = ?) ORDER BY categorie, id`)
    .all(opts.statut ?? "", opts.statut ?? "", opts.categorie ?? "", opts.categorie ?? "") as Row[];
  return rows.map(toDoc);
}

/**
 * Ajoute une connaissance si son identifiant (slug) n'existe pas encore. Idempotent : n'écrase JAMAIS
 * une connaissance existante (modifiée ou non) — l'installation initiale ne défait pas le travail de Jacob.
 */
export function kbSeed(core: Core, doc: KbInput, now = Date.now()): boolean {
  const res = core.sqlite
    .prepare(
      `INSERT OR IGNORE INTO kb_docs (slug, titre, contenu, categorie, juridiction, nature, source, source_url, verifie_le, version,
         conditions, fiabilite, statut, revue_jours, visible_client, origine, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'actif', ?, ?, ?, ?, ?)`,
    )
    .run(
      doc.slug, doc.titre, doc.contenu, doc.categorie, doc.juridiction ?? "", doc.nature ?? "reglementaire",
      doc.source ?? "", doc.sourceUrl ?? "", doc.verifieLe ?? null, doc.conditions ?? "", doc.fiabilite ?? "a_verifier",
      doc.revueJours ?? 180, doc.visibleClient ? 1 : 0, doc.origine ?? "manager", now, now,
    ) as { changes: number };
  if (res.changes > 0) {
    const id = (core.sqlite.prepare(`SELECT id FROM kb_docs WHERE slug = ?`).get(doc.slug) as { id: number }).id;
    core.sqlite.prepare(`INSERT INTO kb_versions (doc_id, version, titre, contenu, ts, motif) VALUES (?, 1, ?, ?, ?, 'Création')`).run(id, doc.titre, doc.contenu, now);
  }
  return res.changes > 0;
}

export interface KbUpdate {
  titre?: string;
  contenu?: string;
  conditions?: string;
  source?: string;
  sourceUrl?: string;
  juridiction?: string;
  fiabilite?: KbFiabilite;
  statut?: KbStatut;
  visibleClient?: boolean;
  verifieLe?: number | null;
  revueJours?: number;
}

/** Met à jour une connaissance. Un changement de titre/contenu crée une nouvelle version et garde l'ancienne. */
export function kbUpdate(core: Core, id: number, patch: KbUpdate, motif = "", origine = "humain", now = Date.now()): boolean {
  const cur = kbGet(core, id);
  if (!cur) return false;
  const contenuChange = (patch.contenu !== undefined && patch.contenu !== cur.contenu) || (patch.titre !== undefined && patch.titre !== cur.titre);
  const version = contenuChange ? cur.version + 1 : cur.version;
  core.sqlite
    .prepare(
      `UPDATE kb_docs SET titre = ?, contenu = ?, conditions = ?, source = ?, source_url = ?, juridiction = ?, fiabilite = ?,
         statut = ?, visible_client = ?, verifie_le = ?, revue_jours = ?, version = ?, modifie_humain = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      patch.titre ?? cur.titre, patch.contenu ?? cur.contenu, patch.conditions ?? cur.conditions, patch.source ?? cur.source,
      patch.sourceUrl ?? cur.sourceUrl, patch.juridiction ?? cur.juridiction, patch.fiabilite ?? cur.fiabilite,
      patch.statut ?? cur.statut, (patch.visibleClient ?? cur.visibleClient) ? 1 : 0,
      patch.verifieLe === undefined ? cur.verifieLe : patch.verifieLe, patch.revueJours ?? cur.revueJours, version,
      origine === "humain" ? 1 : cur.modifieHumain ? 1 : 0, now, id,
    );
  if (contenuChange) {
    core.sqlite
      .prepare(`INSERT INTO kb_versions (doc_id, version, titre, contenu, ts, motif) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, version, patch.titre ?? cur.titre, patch.contenu ?? cur.contenu, now, motif.slice(0, 300));
  }
  return true;
}

export function kbVersions(core: Core, id: number): Array<{ version: number; titre: string; contenu: string; ts: number; motif: string }> {
  return core.sqlite.prepare(`SELECT version, titre, contenu, ts, motif FROM kb_versions WHERE doc_id = ? ORDER BY version DESC`).all(id) as Array<{
    version: number; titre: string; contenu: string; ts: number; motif: string;
  }>;
}

/** Marque une connaissance comme relue et toujours exacte (sans changer son contenu). */
export function kbMarkVerified(core: Core, id: number, source?: { source: string; sourceUrl: string }, now = Date.now()): boolean {
  return kbUpdate(core, id, { verifieLe: now, fiabilite: "officielle_verifiee", ...(source ?? {}) }, "Vérification", "humain", now);
}

// ── Obsolescence ──

export interface KbStaleItem {
  doc: KbDoc;
  raison: "jamais_verifiee" | "verification_ancienne" | "source_manquante";
  detail: string;
  ageJours: number | null;
}

/**
 * Connaissances à revérifier. Rien n'est modifié ni supprimé : la liste PROPOSE une mise à jour,
 * Jacob (ou l'agent, avec sa validation) décide. Les offres commerciales ne sont jamais concernées.
 */
export function kbStale(core: Core, now = Date.now()): KbStaleItem[] {
  const out: KbStaleItem[] = [];
  for (const d of kbList(core, { statut: "actif" })) {
    if (d.nature !== "reglementaire") continue;
    if (d.verifieLe === null) {
      out.push({ doc: d, raison: "jamais_verifiee", detail: "Jamais vérifiée auprès d'une source officielle", ageJours: null });
    } else {
      const age = Math.floor((now - d.verifieLe) / 86_400_000);
      if (age > d.revueJours) out.push({ doc: d, raison: "verification_ancienne", detail: `Vérifiée il y a ${age} jours (revue tous les ${d.revueJours} jours)`, ageJours: age });
    }
    if (!d.sourceUrl) out.push({ doc: d, raison: "source_manquante", detail: "Aucun lien de source officielle", ageJours: null });
  }
  return out;
}

// ── Recherche ──

const STOP = new Set(
  "le la les un une des du de d l et ou a au aux en dans sur pour par avec sans que qui quoi est sont ce cet cette ces il elle ils on je tu nous vous mon ma mes ton ta tes son sa ses leur leurs ne pas plus se si y fait faut peut puis tres bien aussi comme mais donc or ni car quel quelle quels quelles comment combien".split(" "),
);
const SYN: Record<string, string[]> = {
  impot: ["fiscalite", "taxe", "tax"], impots: ["fiscalite", "taxe"], taxe: ["fiscalite", "impot"], tva: ["vat", "fiscalite"],
  hk: ["hong", "kong"], hongkong: ["hong", "kong"], usa: ["americain", "etats", "unis"], us: ["americain"], americaine: ["americain", "llc"],
  societe: ["llc", "ltd", "company"], entreprise: ["societe", "llc"], banque: ["compte", "bancaire", "banques"],
  stripe: ["paiement"], paypal: ["paiement"], wise: ["compte", "paiement"], mercury: ["compte", "banque"], payoneer: ["paiement"],
  fermer: ["dissolution", "fermeture"], fermeture: ["dissolution", "deregistration"], dissoudre: ["dissolution"],
  declaration: ["formulaire", "form"], formulaire: ["form"], bof: [], ein: ["irs", "identifiant"],
};

export function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 ? w.replace(/(s|x)$/, "") : w));
}

export interface KbHit {
  doc: KbDoc;
  score: number;
}

export interface KbSearchOpts {
  limit?: number;
  /** Ne remonte que les connaissances autorisées à être partagées avec les clients. */
  clientOnly?: boolean;
  juridiction?: string;
  includeObsolete?: boolean;
  minScore?: number;
}

/** Recherche des connaissances pertinentes. Renvoie [] quand rien ne ressemble à la demande (rien n'est envoyé à l'IA). */
export function kbSearch(core: Core, query: string, opts: KbSearchOpts = {}): KbHit[] {
  const terms = new Set<string>();
  for (const t of tokenize(query)) {
    terms.add(t);
    for (const s of SYN[t] ?? []) terms.add(s);
  }
  if (terms.size === 0) return [];
  const direct = new Set(tokenize(query));
  const docs = kbList(core, opts.includeObsolete ? {} : { statut: "actif" }).filter(
    (d) => (!opts.clientOnly || d.visibleClient) && (!opts.juridiction || d.juridiction === opts.juridiction || d.juridiction === ""),
  );
  if (docs.length === 0) return [];

  const prepared = docs.map((d) => ({
    d,
    title: new Set(tokenize(`${d.titre} ${d.categorie}`)),
    body: tokenize(d.contenu),
  }));
  const df = new Map<string, number>();
  for (const p of prepared) {
    const seen = new Set([...p.title, ...p.body]);
    for (const t of terms) if (seen.has(t)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = prepared.length;
  const hits: KbHit[] = [];
  for (const p of prepared) {
    let score = 0;
    let matched = 0;
    for (const t of terms) {
      const n = df.get(t) ?? 0;
      if (n === 0) continue;
      const idf = Math.log(1 + N / n);
      const tf = p.body.reduce((a, w) => (w === t ? a + 1 : a), 0);
      const w = direct.has(t) ? 1 : 0.5;
      const part = (p.title.has(t) ? 3 : 0) + (tf > 0 ? 1 + Math.log(tf) : 0);
      if (part > 0) matched++;
      score += idf * part * w;
    }
    if (matched === 0) continue;
    // Plusieurs termes de la demande retrouvés = pertinent ; un seul terme isolé, moins.
    score *= 0.6 + 0.4 * Math.min(1, matched / Math.max(2, direct.size));
    hits.push({ doc: p.d, score });
  }
  hits.sort((a, b) => b.score - a.score);
  const min = opts.minScore ?? 2;
  return hits.filter((h) => h.score >= min).slice(0, opts.limit ?? 4);
}

/** Texte prêt à injecter dans le contexte de l'IA : uniquement les extraits pertinents, dans un budget de caractères. */
export function kbContext(core: Core, query: string, opts: KbSearchOpts & { maxChars?: number } = {}): string {
  const hits = kbSearch(core, query, opts);
  if (hits.length === 0) return "";
  let budget = opts.maxChars ?? 2500;
  const parts: string[] = [];
  for (const { doc } of hits) {
    const verif = doc.verifieLe ? `vérifié le ${new Date(doc.verifieLe).toISOString().slice(0, 10)}` : "NON vérifié auprès d'une source officielle";
    const head = `### ${doc.titre} [${doc.juridiction || "général"} · ${doc.nature === "commercial" ? "info commerciale validée par Jacob" : "info réglementaire"} · ${verif}]`;
    const body = doc.contenu.length > budget ? `${doc.contenu.slice(0, Math.max(0, budget - head.length))}…` : doc.contenu;
    const block = `${head}\n${body}${doc.conditions ? `\nConditions : ${doc.conditions}` : ""}`;
    if (budget - block.length < 0 && parts.length > 0) break;
    parts.push(block);
    budget -= block.length;
    if (budget <= 200) break;
  }
  return parts.join("\n\n");
}

/** Importe des connaissances (par ex. d'un futur agent spécialisé) sous son nom d'origine, sans jamais écraser l'existant. */
export function kbShare(core: Core, origine: string, docs: KbInput[], now = Date.now()): { ajoutees: number; ignorees: number } {
  let ajoutees = 0;
  for (const d of docs) if (kbSeed(core, { ...d, origine }, now)) ajoutees++;
  return { ajoutees, ignorees: docs.length - ajoutees };
}
