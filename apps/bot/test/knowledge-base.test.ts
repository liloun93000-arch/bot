import { readFileSync } from "node:fs";
import { join } from "node:path";
import { kbContext, kbList, kbMarkVerified, kbSearch, kbShare, kbStale, kbUpdate, kbVersions } from "@arbi/core";
import { describe, expect, it } from "vitest";
import { chunkParagraphs, parseKnowledgeSource, seedKnowledgeBase, verifiedKnowledge } from "../src/kb-seed";
import { testCore } from "./helpers";

const SOURCE = join(__dirname, "../../../data/knowledge/llc-ltd-source.txt");
const silent = { info() {}, error() {}, warn() {}, debug() {} } as never;
const DAY = 86_400_000;

function seeded() {
  const core = testCore();
  seedKnowledgeBase(core, SOURCE, silent);
  return core;
}

describe("base de connaissances LLC / LTD", () => {
  it("découpe la source en connaissances structurées couvrant les thèmes A à X et la comparaison", () => {
    const docs = parseKnowledgeSource(readFileSync(SOURCE, "utf8"));
    const lettres = new Set(docs.map((d) => d.slug.split(":")[1]));
    for (const l of "abcdefghjklmnopqrstuvwx") expect(lettres.has(l)).toBe(true);
    expect(docs.some((d) => d.categorie === "Comparaison LLC / LTD")).toBe(true);
    for (const d of docs) {
      expect(d.contenu.length).toBeLessThanOrEqual(1700);
      expect(d.categorie && d.juridiction !== undefined && d.source).toBeTruthy();
    }
    expect(chunkParagraphs("a\n\nb\n\n" + "c".repeat(30), 20).length).toBeGreaterThan(1);
  });

  it("l'ancienne consigne BOI de la source n'est pas reprise : la règle officielle vérifiée la remplace", () => {
    const core = seeded();
    const boi = kbList(core, { categorie: "LLC — FinCEN" });
    expect(boi).toHaveLength(1);
    expect(boi[0]).toMatchObject({ fiabilite: "officielle_verifiee", statut: "actif" });
    expect(boi[0]?.contenu).toContain("14 août 2026");
    expect(boi[0]?.sourceUrl).toContain("federalregister.gov");
    core.close();
  });

  it("distingue le réglementaire (source officielle) du commercial (validé par Jacob)", () => {
    const core = seeded();
    const commercial = kbList(core).filter((d) => d.nature === "commercial");
    expect(commercial).toHaveLength(1);
    expect(commercial[0]?.fiabilite).toBe("validee_jacob");
    expect(commercial[0]?.contenu).toContain("799 €");
    // Le contenu repris de la source de Jacob n'est PAS présenté comme vérifié.
    const nonVerifie = kbList(core).filter((d) => d.slug.startsWith("llc-ltd:"));
    expect(nonVerifie.length).toBeGreaterThan(20);
    expect(nonVerifie.every((d) => d.fiabilite === "a_verifier" && d.verifieLe === null)).toBe(true);
    core.close();
  });

  it("est idempotent et n'écrase jamais une connaissance modifiée par Jacob", () => {
    const core = seeded();
    const n = kbList(core).length;
    const d = kbList(core, { categorie: "LLC — Documents" })[0]!;
    kbUpdate(core, d.id, { contenu: "Version corrigée par Jacob." }, "correction", "humain");
    expect(seedKnowledgeBase(core, SOURCE, silent)).toBe(0);
    expect(kbList(core)).toHaveLength(n);
    expect(kbList(core).find((x) => x.id === d.id)?.contenu).toBe("Version corrigée par Jacob.");
    core.close();
  });

  it("versionne : l'ancien contenu est conservé", () => {
    const core = seeded();
    const d = kbList(core, { categorie: "LLC — Dissolution" })[0]!;
    kbUpdate(core, d.id, { contenu: "Nouveau texte" }, "mise à jour", "humain");
    const versions = kbVersions(core, d.id);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[1]?.contenu).toBe(d.contenu);
    core.close();
  });

  it("recherche : ne remonte que des connaissances pertinentes, rien si hors sujet", () => {
    const core = seeded();
    const ein = kbSearch(core, "c'est quoi un EIN et le formulaire SS-4 ?");
    expect(ein[0]?.doc.categorie).toBe("LLC — Documents");
    const f5472 = kbSearch(core, "Form 5472 pénalité 25 000 USD");
    expect(f5472[0]?.doc.categorie).toBe("LLC — Déclarations");
    const hk = kbSearch(core, "impôt sur les bénéfices à Hong Kong et FSIE");
    expect(hk[0]?.doc.juridiction).toBe("HK");
    expect(kbSearch(core, "recette de tarte aux pommes")).toEqual([]);
    expect(kbSearch(core, "")).toEqual([]);
    core.close();
  });

  it("n'envoie à l'IA qu'un extrait borné, avec source et date de vérification", () => {
    const core = seeded();
    const ctx = kbContext(core, "Les LLC doivent-elles faire le BOI FinCEN ?", { maxChars: 1500 });
    expect(ctx).toContain("FinCEN");
    expect(ctx.length).toBeLessThanOrEqual(1800);
    expect(ctx).toContain("vérifié le 2026-11-18");
    expect(kbContext(core, "bonjour", {})).toBe("");
    core.close();
  });

  it("clientOnly : rien n'est partagé avec les clients tant que Jacob ne l'a pas autorisé", () => {
    const core = seeded();
    expect(kbSearch(core, "EIN IRS formulaire SS-4", { clientOnly: true })).toEqual([]);
    const d = kbList(core, { categorie: "LLC — Documents" })[0]!;
    kbUpdate(core, d.id, { visibleClient: true }, "", "humain");
    expect(kbSearch(core, "EIN IRS formulaire SS-4", { clientOnly: true }).length).toBeGreaterThan(0);
    core.close();
  });

  it("les connaissances obsolètes ne sont plus renvoyées", () => {
    const core = seeded();
    const hit = kbSearch(core, "EIN IRS SS-4")[0]!.doc;
    kbUpdate(core, hit.id, { statut: "obsolete" }, "", "humain");
    expect(kbSearch(core, "EIN IRS SS-4").some((h) => h.doc.id === hit.id)).toBe(false);
    expect(kbSearch(core, "EIN IRS SS-4", { includeObsolete: true }).some((h) => h.doc.id === hit.id)).toBe(true);
    core.close();
  });

  it("détecte les informations à revérifier, sans jamais toucher aux offres commerciales", () => {
    const core = seeded();
    const now = Date.UTC(2027, 5, 1); // ~6,5 mois après la vérification officielle
    const stale = kbStale(core, now);
    expect(stale.some((s) => s.doc.slug === "llc:fincen-boi" && s.raison === "verification_ancienne")).toBe(true);
    expect(stale.some((s) => s.doc.slug.startsWith("llc-ltd:") && s.raison === "jamais_verifiee")).toBe(true);
    expect(stale.some((s) => s.doc.nature === "commercial" || s.doc.nature === "interne")).toBe(false);
    // Marquer comme relu retire l'alerte.
    const boi = kbList(core, { categorie: "LLC — FinCEN" })[0]!;
    kbMarkVerified(core, boi.id, undefined, now - DAY);
    expect(kbStale(core, now).some((s) => s.doc.slug === "llc:fincen-boi" && s.raison === "verification_ancienne")).toBe(false);
    core.close();
  });

  it("prépare le partage avec de futurs agents : import sous leur nom, sans écraser", () => {
    const core = seeded();
    const r = kbShare(core, "agent_llc_ltd", [
      { slug: "agent:nouveau", titre: "Délai EIN observé", contenu: "Selon l'IRS, délai variable.", categorie: "LLC — Documents" },
      { slug: "llc:fincen-boi", titre: "Tentative d'écrasement", contenu: "x", categorie: "LLC — FinCEN" },
    ]);
    expect(r).toEqual({ ajoutees: 1, ignorees: 1 });
    expect(kbList(core).find((d) => d.slug === "agent:nouveau")?.origine).toBe("agent_llc_ltd");
    expect(kbList(core).find((d) => d.slug === "llc:fincen-boi")?.titre).toContain("exemptées");
    core.close();
  });

  it("la source de vérité commerciale reste le catalogue (aucun prix modifiable par la base)", () => {
    const docs = verifiedKnowledge();
    const commercial = docs.find((d) => d.nature === "commercial");
    expect(commercial?.visibleClient).toBe(false);
    expect(commercial?.conditions).toContain("jamais modifiés automatiquement");
  });
});
