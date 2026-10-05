import { describe, expect, it } from "vitest";
import {
  bestMatches,
  confidenceLevel,
  DEFAULT_THRESHOLDS,
  formatEscalationMessage,
  judgeConflictFallback,
  knowledgeRejectReason,
  structureFallback,
  type KnowledgeEntry,
} from "../src/knowledge";
import { testCore } from "./helpers";

function seedPayment(core: ReturnType<typeof testCore>) {
  const s = structureFallback({
    question: "Je peux payer en plusieurs fois ?",
    reponseJacob: "Oui c'est possible, mais uniquement à partir de 500 €. En dessous, paiement en une seule fois.",
    categorie: "paiement",
  });
  const id = core.knowledge.entries.add({
    sujet: s.sujet, theme: s.theme, categorie: s.categorie, offreCle: s.offreCle, intention: s.intention,
    reponse: s.reponse, conditions: s.conditions, exceptions: s.exceptions, source: "jacob",
    questionOrigine: "Je peux payer en plusieurs fois ?", reponseJacob: "…",
  });
  return { id, s };
}

describe("Apprentissage — correspondance sémantique", () => {
  it("retrouve la connaissance pour trois paraphrases", () => {
    const core = testCore();
    seedPayment(core);
    const entries = core.knowledge.entries.active();
    for (const q of [
      "Je peux payer en deux fois ?",
      "Vous acceptez le paiement fractionné ?",
      "Possible 50 % maintenant et 50 % après ?",
    ]) {
      const m = bestMatches(entries, q)[0];
      expect(m, q).toBeDefined();
      expect(confidenceLevel(m!.score, DEFAULT_THRESHOLDS), q).toBe("elevee");
    }
  });
  it("une question sans rapport reste en confiance faible", () => {
    const core = testCore();
    seedPayment(core);
    const m = bestMatches(core.knowledge.entries.active(), "Vous êtes ouverts le dimanche ?")[0];
    expect(!m || confidenceLevel(m.score) === "faible").toBe(true);
  });
});

describe("Apprentissage — structuration", () => {
  it("préserve la condition au lieu de la simplifier", () => {
    const { s } = seedPayment(testCore());
    expect(s.conditions).toMatch(/500/);
    expect(s.conditions.toLowerCase()).toMatch(/partir de/);
  });
  it("refuse les liens de paiement, téléphones et e-mails", () => {
    expect(knowledgeRejectReason(["écris à jacob@exemple.fr"])).toBeTruthy();
    expect(knowledgeRejectReason(["appelle le 06 12 34 56 78"])).toBeTruthy();
    expect(knowledgeRejectReason(["à partir de 500 €"])).toBeNull();
  });
});

describe("Apprentissage — contradictions", () => {
  it("la nouvelle info de Jacob remplace l'ancienne et l'historique est conservé", () => {
    const core = testCore();
    const oldId = core.knowledge.entries.add({
      sujet: "délai de livraison", theme: "livraison", categorie: "livraison", intention: "Quel est le délai de livraison ?",
      reponse: "Le délai est de 10 jours.", source: "jacob",
    });
    const incoming = structureFallback({
      question: "Quel délai ?", reponseJacob: "Le délai est maintenant de 15 jours.", categorie: "livraison",
      sujet: "délai de livraison", correction: true,
    });
    const old = core.knowledge.entries.get(oldId) as KnowledgeEntry;
    expect(["contradiction", "precision", "meme"]).toContain(judgeConflictFallback(old, incoming));
    const newId = core.knowledge.entries.replace(oldId, {
      sujet: incoming.sujet, intention: incoming.intention, reponse: incoming.reponse, source: "correction",
    }, "Jacob : 10 → 15 jours");
    expect(core.knowledge.entries.get(oldId)?.statut).toBe("remplace");
    expect(core.knowledge.entries.get(newId)?.statut).toBe("actif");
    expect(core.knowledge.entries.active().map((e) => e.id)).toEqual([newId]);
    const hist = core.knowledge.entries.history(oldId);
    expect(hist.some((h) => h.action === "remplacement" || h.action === "conflit")).toBe(true);
  });
});

describe("Escalade — dédoublonnage et format", () => {
  it("regroupe les questions quasi identiques en une seule demande", () => {
    const core = testCore();
    const id = core.knowledge.escalations.create({ waId: "33600000001", question: "Vous faites des devis pour les mariages à l'étranger ?" });
    const dup = core.knowledge.escalations.findOpenSimilar("Est-ce que vous faites un devis pour un mariage à l'étranger ?");
    expect(dup?.id).toBe(id);
    core.knowledge.escalations.link(id, "33600000002", "Devis mariage à l'étranger possible ?");
    expect(core.knowledge.escalations.links(id).length).toBe(2);
    expect(core.knowledge.escalations.countOpen()).toBe(1);
    expect(core.knowledge.escalations.findOpenSimilar("Quels sont vos horaires ?")).toBeUndefined();
  });
  it("résout et retrouve par wamid", () => {
    const core = testCore();
    const id = core.knowledge.escalations.create({ waId: "33600000001", question: "Question X ?" });
    core.knowledge.escalations.addMessage(id, "33778783701", "wamid.ABC");
    expect(core.knowledge.escalations.byWamid("wamid.ABC")?.id).toBe(id);
    core.knowledge.escalations.resolve(id, { reponseJacob: "Oui", entryId: null });
    expect(core.knowledge.escalations.countOpen()).toBe(0);
  });
  it("respecte le format du message à Jacob", () => {
    const m = formatEscalationMessage({ clientLabel: "Marie (+33 6 00 00 00 01)", categorie: "Tarifs", question: "Prix d'un shooting ?" });
    expect(m).toContain("🤖 ARBI JACOB — QUESTION CLIENT");
    expect(m).toContain("Réponds simplement à ce message.");
    expect(m).toContain("enrichir mes connaissances");
  });
});
