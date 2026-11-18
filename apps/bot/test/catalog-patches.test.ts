import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyLlcSection, applyMotosSection, LLC_MARKER, MOTOS_MARKER, patchCatalogue } from "../src/catalog-patches";
import { buildStaticPrompt } from "../src/prompt";
import { testCore } from "./helpers";

const FILE = readFileSync(join(__dirname, "../../../data/catalogue.md"), "utf8");
const BAR = "=".repeat(62);
/** Catalogue « en ligne » d'avant la mise à jour : ancienne section 55, sans repères. */
const CATALOGUE = [
  `${BAR}\n54. UNE SECTION AVANT\n${BAR}\ntexte précédent\n`,
  `${BAR}\n55. CRÉATION DE SOCIÉTÉ (LLC USA)\n${BAR}\nLe bot doit rester général sur les sujets juridiques/fiscaux et ne pas donner de conseil personnalisé.\nLLC WYOMING : Basique 799 €\n`,
  `${BAR}\n56. GHOST STUDIO — PRESTATIONS DIGITALES\n${BAR}\ntexte suivant\n`,
  `${BAR}\n39. FOURNISSEUR SURRON\n${BAR}\nmotos\n`,
  `${BAR}\n40. AUTRE FOURNISSEUR\n${BAR}\nsuite\n`,
].join("\n");
const silent = { info() {}, error() {}, warn() {}, debug() {} } as never;

describe("discours LLC / LTD et motos dans le catalogue", () => {
  it("le fichier data/catalogue.md livré contient déjà les deux blocs (installation neuve)", () => {
    expect(FILE).toContain(`<!-- ${LLC_MARKER} -->`);
    expect(FILE).toContain(`<!-- ${MOTOS_MARKER} -->`);
    expect(FILE.split(`<!-- ${LLC_MARKER} -->`)).toHaveLength(2);
    expect(FILE.trimEnd().endsWith("FIN DU SCRIPT V9.2\n" + BAR)).toBe(true);
  });

  it("remplace l'ancienne section 55 sans toucher aux sections voisines", () => {
    const out = applyLlcSection(CATALOGUE);
    expect(out).toContain(`<!-- ${LLC_MARKER} -->`);
    expect(out).not.toContain("Le bot doit rester général sur les sujets juridiques/fiscaux et ne pas donner de conseil personnalisé.");
    // La section suivante et la précédente sont intactes.
    expect(out).toContain("56. GHOST STUDIO — PRESTATIONS DIGITALES");
    expect(out).toContain("54. UNE SECTION AVANT");
    expect(out.indexOf("55. CRÉATION DE SOCIÉTÉ")).toBeLessThan(out.indexOf("56. GHOST STUDIO"));
  });

  it("contient le contenu exact des trois formules et les tarifs validés", () => {
    const out = applyLlcSection(CATALOGUE);
    expect(out).toMatch(/BASIQUE[\s\S]*?agent enregistré[\s\S]*?numéro de téléphone[\s\S]*?EIN/);
    expect(out).toMatch(/AUCUNE ouverture de compte professionnel/);
    for (const compte of ["2 comptes Stripe", "1 compte PayPal Business", "1 compte Wise Business", "1 compte Mercury", "1 compte Payoneer Business", "Shopify Payments"]) {
      expect(out).toContain(compte);
    }
    expect(out).toMatch(/ULTIME[\s\S]*?Shopify OU WordPress/);
    for (const prix of ["799 €", "945 €", "1 130 €", "545 €", "690 €", "850 €"]) expect(out).toContain(prix);
    expect(out).toContain("LTD HONG KONG : 1 500 €");
  });

  it("n'autorise aucune promesse fiscale ni garantie de compte", () => {
    const out = applyLlcSection(CATALOGUE);
    expect(out).toMatch(/✗ une exonération fiscale automatique/);
    expect(out).toMatch(/✗ la garantie d'ouverture d'un compte professionnel/);
    expect(out).toMatch(/PAS une fraude/);
  });

  it("est idempotent et ne crée jamais de doublon", () => {
    const once = applyMotosSection(applyLlcSection(CATALOGUE));
    const twice = applyMotosSection(applyLlcSection(once));
    expect(twice).toBe(once);
    expect(once.split(`<!-- ${LLC_MARKER} -->`)).toHaveLength(2);
    expect(once.split(`<!-- ${MOTOS_MARKER} -->`)).toHaveLength(2);
  });

  it("intègre les connaissances motos sans confondre VIN, papiers espagnols et homologation", () => {
    const out = applyMotosSection(CATALOGUE);
    expect(out).toMatch(/chargeur est fourni/);
    expect(out).toMatch(/VIN ≠ une homologation routière/);
    expect(out).toMatch(/documents espagnols ≠ un certificat de conformité européen/);
    expect(out).toMatch(/AUCUNE démarche d'homologation ni d'immatriculation/);
  });

  it("patchCatalogue : une seule nouvelle version, historique conservé, modifications du dashboard gardées", () => {
    const core = testCore();
    core.catalogue.save(`${CATALOGUE}\n\nNOTE AJOUTÉE PAR JACOB DEPUIS LE DASHBOARD`, "version existante");
    const avant = core.catalogue.versions(50).length;
    expect(patchCatalogue(core, silent)).toBe(true);
    const apres = core.catalogue.current().contenu;
    expect(apres).toContain("NOTE AJOUTÉE PAR JACOB DEPUIS LE DASHBOARD");
    expect(apres).toContain(`<!-- ${LLC_MARKER} -->`);
    expect(core.catalogue.versions(50)).toHaveLength(avant + 1);
    // Rejoué au redémarrage suivant : aucun effet.
    expect(patchCatalogue(core, silent)).toBe(false);
    expect(core.catalogue.versions(50)).toHaveLength(avant + 1);
    core.close();
  });

  it("le prompt réellement envoyé à l'IA contient les trois formules, la règle Basique et la priorité LLC", () => {
    const prompt = buildStaticPrompt(FILE, []);
    expect(prompt).toContain("AUCUNE ouverture de compte professionnel");
    expect(prompt).toMatch(/ULTIME[\s\S]*?Shopify OU WordPress/);
    expect(prompt).toContain("LTD HONG KONG : 1 500 €");
    expect(prompt).toContain("VIN ≠ une homologation routière");
    expect(prompt).not.toContain("Le bot doit rester général sur les sujets juridiques/fiscaux et ne pas donner de conseil personnalisé.");
  });
});
