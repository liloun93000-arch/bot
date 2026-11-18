import { existsSync, readFileSync } from "node:fs";
import { kbSeed, type Core, type KbInput, type Logger } from "@arbi/core";
import { LLC_SECTION } from "./catalog-patches";

/** Date de la vérification officielle faite pour cette livraison (FinCEN / Federal Register / Wyoming SOS). */
export const KB_VERIFIED_AT = Date.UTC(2026, 10, 18);

const US_SOURCES = {
  irs: ["IRS", "https://www.irs.gov"],
  fincen: ["FinCEN", "https://www.fincen.gov/boi"],
  wyoming: ["Wyoming Secretary of State", "https://sos.wyo.gov"],
  nm: ["New Mexico Secretary of State", "https://enterprise.sos.nm.gov"],
  llc: ["IRS — classification des LLC", "https://www.irs.gov/businesses/small-businesses-self-employed/limited-liability-company-llc"],
  ein: ["IRS — EIN", "https://www.irs.gov/businesses/employer-identification-number"],
  f5472: ["IRS — instructions Form 5472", "https://www.irs.gov/instructions/i5472"],
  nr: ["IRS — non-résidents", "https://www.irs.gov/individuals/international-taxpayers/taxation-of-nonresident-aliens"],
  fr: ["Administration fiscale française", "https://www.impots.gouv.fr"],
  hkcr: ["Companies Registry de Hong Kong", "https://www.cr.gov.hk/en/services/register-company.htm"],
  hkird: ["Inland Revenue Department de Hong Kong", "https://www.ird.gov.hk/eng/tax/bus_pft.htm"],
  hkar: ["Companies Registry — Annual Return", "https://www.cr.gov.hk/en/compliance/annual-return/private-company.htm"],
  hkscr: ["Companies Registry — Significant Controllers Register", "https://www.cr.gov.hk/en/legislation/scr/overview.htm"],
  prest: ["Documentation officielle du prestataire (Stripe, PayPal, Wise, Mercury, Payoneer, Shopify, banques HK)", ""],
} as const;

interface Meta { categorie: string; juridiction: string; src: keyof typeof US_SOURCES; revue?: number }
/** Une lettre de la spécification = un thème de la base. */
const META: Record<string, Meta> = {
  A: { categorie: "LLC — Constitution", juridiction: "US", src: "llc" },
  B: { categorie: "LLC — Wyoming / New Mexico", juridiction: "US", src: "wyoming" },
  C: { categorie: "LLC — Documents", juridiction: "US", src: "ein" },
  D: { categorie: "LLC — Constitution", juridiction: "US", src: "wyoming" },
  E: { categorie: "LLC — Constitution", juridiction: "US", src: "wyoming" },
  F: { categorie: "LLC — Fiscalité américaine", juridiction: "US", src: "llc" },
  G: { categorie: "LLC — Déclarations", juridiction: "US", src: "f5472", revue: 90 },
  H: { categorie: "LLC — Déclarations", juridiction: "US", src: "irs" },
  I: { categorie: "LLC — FinCEN", juridiction: "US", src: "fincen", revue: 60 },
  J: { categorie: "LLC — Confidentialité", juridiction: "US", src: "fincen" },
  K: { categorie: "LLC — Comptes professionnels et paiements", juridiction: "US", src: "prest", revue: 90 },
  L: { categorie: "LLC — Maintien", juridiction: "US", src: "wyoming" },
  M: { categorie: "LLC — E-commerce", juridiction: "US", src: "irs" },
  N: { categorie: "LLC — Fiscalité française", juridiction: "FR", src: "fr" },
  O: { categorie: "LLC — Dissolution", juridiction: "US", src: "wyoming" },
  P: { categorie: "LTD Hong Kong — Constitution", juridiction: "HK", src: "hkcr" },
  Q: { categorie: "LTD Hong Kong — Constitution", juridiction: "HK", src: "hkcr" },
  R: { categorie: "LTD Hong Kong — Documents", juridiction: "HK", src: "hkcr" },
  S: { categorie: "LTD Hong Kong — Fiscalité", juridiction: "HK", src: "hkird" },
  T: { categorie: "LTD Hong Kong — Fiscalité", juridiction: "HK", src: "hkird" },
  U: { categorie: "LTD Hong Kong — Obligations annuelles", juridiction: "HK", src: "hkar" },
  V: { categorie: "LTD Hong Kong — Banques", juridiction: "HK", src: "prest", revue: 90 },
  W: { categorie: "LTD Hong Kong — Fiscalité française", juridiction: "FR", src: "fr" },
  X: { categorie: "LTD Hong Kong — Dissolution", juridiction: "HK", src: "hkcr" },
};

const MAX_CHUNK = 1500;

/** Coupe un long texte en blocs de paragraphes ≤ MAX_CHUNK caractères (jamais au milieu d'une phrase). */
export function chunkParagraphs(text: string, max = MAX_CHUNK): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > max) {
      out.push(cur);
      cur = p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

/** Transforme le texte source en connaissances structurées. Fonction pure (testable). */
export function parseKnowledgeSource(raw: string): KbInput[] {
  const lines = raw.replace(/\r/g, "").split("\n");
  const sections: Array<{ key: string; titre: string; body: string[] }> = [];
  for (const line of lines) {
    const h = /^([A-X])\. (.{3,90})$/.exec(line.trim());
    const cmp = /^COMPARAISON LLC AM.RICAINE ET LTD HONGKONGAISE$/.test(line.trim());
    if (h && h[1] && h[2] && (sections.length === 0 || h[1].charCodeAt(0) === (sections.at(-1)?.key.charCodeAt(0) ?? 64) + 1)) {
      sections.push({ key: h[1], titre: h[2].trim(), body: [] });
    } else if (cmp) {
      sections.push({ key: "COMP", titre: "Comparaison LLC américaine et LTD hongkongaise", body: [] });
    } else sections.at(-1)?.body.push(line);
  }
  const docs: KbInput[] = [];
  for (const s of sections) {
    const body = s.body.join("\n").trim();
    if (!body) continue;
    const m: Meta = s.key === "COMP" ? { categorie: "Comparaison LLC / LTD", juridiction: "", src: "irs" } : (META[s.key] as Meta);
    const [srcName, srcUrl] = s.key === "COMP" ? ["Synthèse interne (LLC : IRS ; LTD : IRD / Companies Registry de Hong Kong)", ""] : US_SOURCES[m.src];
    // Le paragraphe BOI de la spécification est remplacé par la version vérifiée (voir kbBoi).
    if (s.key === "I") continue;
    const chunks = chunkParagraphs(body);
    chunks.forEach((c, i) =>
      docs.push({
        slug: `llc-ltd:${s.key.toLowerCase()}:${i + 1}`,
        titre: chunks.length > 1 ? `${s.titre} (${i + 1}/${chunks.length})` : s.titre,
        contenu: c,
        categorie: m.categorie,
        juridiction: m.juridiction,
        nature: "reglementaire",
        source: `${srcName} — contenu fourni par Jacob le 18/11/2026, à confirmer auprès de la source officielle`,
        sourceUrl: srcUrl,
        verifieLe: null,
        fiabilite: "a_verifier",
        revueJours: m.revue ?? 180,
        origine: "manager",
      }),
    );
  }
  return docs;
}

/** Connaissances réellement vérifiées auprès de sources officielles le 18/11/2026. */
export function verifiedKnowledge(): KbInput[] {
  return [
    {
      slug: "llc:fincen-boi",
      titre: "FinCEN / BOI — les sociétés constituées aux États-Unis sont exemptées",
      contenu:
        "Règle définitive FinCEN publiée au Federal Register le 14 août 2026 (91 FR 52508), en vigueur le 14 août 2026 (et non à une date ultérieure) : " +
        "les entités constituées aux États-Unis (« domestic reporting companies », donc une LLC du Wyoming ou du New Mexico) n'ont plus à déposer de rapport BOI, " +
        "et leurs bénéficiaires effectifs de nationalité américaine n'ont plus rien à déclarer. " +
        "Restent concernées : les entités étrangères enregistrées pour exercer aux États-Unis (BOI sur leurs bénéficiaires effectifs non américains, délai de 30 jours après l'enregistrement). " +
        "Cette exemption ne supprime ni les vérifications bancaires (KYC), ni les obligations fiscales (IRS), ni la lutte contre le blanchiment. " +
        "Ne pas reprendre d'anciennes consignes BOI (déclaration obligatoire sous peine d'amende) : elles sont obsolètes.",
      categorie: "LLC — FinCEN",
      juridiction: "US",
      nature: "reglementaire",
      source: "FinCEN et Federal Register (règle du 14/08/2026)",
      sourceUrl: "https://www.federalregister.gov/documents/2026/08/14/2026-16576/beneficial-ownership-information-reporting-requirement-revision",
      verifieLe: KB_VERIFIED_AT,
      conditions: "La consigne reçue mentionnait une date de référence au 18/11/2026 : la règle officielle est en vigueur depuis le 14/08/2026.",
      fiabilite: "officielle_verifiee",
      revueJours: 60,
    },
    {
      slug: "llc:wyoming-frais-officiels",
      titre: "LLC Wyoming — frais officiels de l'État (barème du Secretary of State)",
      contenu:
        "Barème officiel (Wyoming Secretary of State, révisé 06/2021, en vigueur depuis le 01/07/2021) : Articles of Organization 100 USD · " +
        "redevance annuelle (annual report license tax) : minimum 60 USD, ou 0,02 % des actifs situés et employés au Wyoming si ce montant est supérieur · " +
        "inscription annuelle d'un Registered Agent commercial : 50 USD · changement de Registered Agent : 5 USD · " +
        "réinstatement faute de Registered Agent : 350 USD · autre dépôt (amendement, dissolution…) : 60 USD. " +
        "Ces frais d'État ne sont PAS les tarifs commerciaux ARBI JACOB.",
      categorie: "LLC — Wyoming / New Mexico",
      juridiction: "US-WY",
      nature: "reglementaire",
      source: "Wyoming Secretary of State — Business Division, barème des frais",
      sourceUrl: "https://sos.wyo.gov/Business/docs/BusinessFees-Effective-07.01.2021.pdf",
      verifieLe: KB_VERIFIED_AT,
      conditions: "Barème daté de 2021 : à revérifier sur sos.wyo.gov avant de citer un montant à un client.",
      fiabilite: "officielle_verifiee",
      revueJours: 180,
    },
    {
      slug: "commercial:llc-offres",
      titre: "LLC — offres commerciales ARBI JACOB (3 formules)",
      contenu: LLC_SECTION,
      categorie: "LLC — Offres commerciales",
      juridiction: "US",
      nature: "commercial",
      source: "Catalogue validé par Jacob (bloc ARBI:LLC-V10). Source de vérité des prix : « Catalogue & tarifs ».",
      sourceUrl: "",
      verifieLe: KB_VERIFIED_AT,
      conditions: "Prix et contenus jamais modifiés automatiquement : seule la modification manuelle de Jacob fait foi.",
      fiabilite: "validee_jacob",
      revueJours: 36500,
      // Déjà dans le catalogue du bot : jamais réinjecté en double.
      visibleClient: false,
      origine: "manager",
    },
    {
      slug: "interne:principes-agent-specialise",
      titre: "Principes de l'agent spécialisé LLC / LTD",
      contenu:
        "Ne jamais donner de conseil fiscal ou juridique personnalisé : informer, comparer, orienter vers un professionnel qualifié. " +
        "Ne jamais promettre une exonération d'impôt, l'ouverture d'un compte bancaire ou l'absence d'impôt dans le pays de résidence. " +
        "Ne jamais conseiller de fausse adresse, de faux associé, de faux justificatif ou de fausse identité. " +
        "Citer la source et la date de vérification des informations réglementaires. " +
        "Ne jamais modifier un tarif commercial ; les prix viennent uniquement du catalogue validé par Jacob. " +
        "Privilégier la LLC lorsqu'elle correspond réellement au besoin, sans dénigrer la LTD Hong Kong.",
      categorie: "Procédures internes ARBI JACOB",
      juridiction: "",
      nature: "interne",
      source: "Instructions de Jacob",
      verifieLe: KB_VERIFIED_AT,
      fiabilite: "interne",
      revueJours: 36500,
    },
  ];
}

/** Installe la base (idempotent : n'écrase jamais une connaissance existante). Renvoie le nombre de connaissances ajoutées. */
export function seedKnowledgeBase(core: Core, sourcePath: string, log: Logger): number {
  let added = 0;
  const docs = [...verifiedKnowledge()];
  if (existsSync(sourcePath)) docs.push(...parseKnowledgeSource(readFileSync(sourcePath, "utf8")));
  else log.warn({ sourcePath }, "kb_source_missing");
  for (const d of docs) if (kbSeed(core, d)) added++;
  if (added > 0) log.info({ added }, "kb_seeded");
  return added;
}
