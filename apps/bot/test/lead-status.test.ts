import {
  confirmLeadWon,
  evaluateLeadsFor,
  isExplicitRefusal,
  isQuoteMessage,
  leadStatusHistory,
  setLeadStatusHuman,
} from "@arbi/core";
import { describe, expect, it } from "vitest";
import { testCore } from "./helpers";

const WA = "33611112222";
const T0 = 1_700_000_000_000;
const H = 3_600_000;

function newLead(core: ReturnType<typeof testCore>, waId = WA, extra: Partial<{ besoin: string; budget: string; delai: string; score: number }> = {}) {
  core.contacts.upsert(waId);
  core.leads.insert(waId, { offre: "LLC Wyoming", besoin: extra.besoin ?? "", budget: extra.budget ?? "", delai: extra.delai ?? "", score: extra.score ?? 1 });
  const id = (core.sqlite.prepare(`SELECT MAX(id) AS id FROM leads WHERE wa_id = ?`).get(waId) as { id: number }).id;
  core.sqlite.prepare(`UPDATE leads SET ts = ? WHERE id = ?`).run(T0, id);
  return id;
}
const statutOf = (core: ReturnType<typeof testCore>, id: number) =>
  (core.sqlite.prepare(`SELECT statut FROM leads WHERE id = ?`).get(id) as { statut: string }).statut;

describe("détection des éléments déclencheurs", () => {
  it("un prix générique n'est pas un devis ; une proposition chiffrée en est un", () => {
    expect(isQuoteMessage("La LLC Wyoming Basique est à 799 €.")).toBe(false);
    expect(isQuoteMessage("Je peux te faire un devis si tu veux")).toBe(false);
    expect(isQuoteMessage("Voici ton devis personnalisé : LLC Wyoming Prestige 945 € tout compris")).toBe(true);
    expect(isQuoteMessage("[Document envoyé : devis-llc.pdf]")).toBe(true);
    expect(isQuoteMessage("[Document envoyé : plaquette.pdf]")).toBe(false);
  });

  it("n'interprète pas un « non merci » anodin comme un abandon", () => {
    expect(isExplicitRefusal("non merci")).toBe(false);
    expect(isExplicitRefusal("Je laisse tomber, ça ne m'intéresse plus")).toBe(true);
    expect(isExplicitRefusal("non merci", true)).toBe(true);
  });
});

describe("évolution automatique des 5 statuts", () => {
  it("Nouveau → En cours quand le client répond et que le besoin est qualifié", () => {
    const core = testCore();
    const id = newLead(core, WA, { besoin: "créer une LLC pour mon e-commerce" });
    core.messages.insert(WA, "user", "Oui je vends sur Shopify", null, T0 + H);
    evaluateLeadsFor(core, WA, T0 + 2 * H);
    expect(statutOf(core, id)).toBe("en_cours");
    const hist = leadStatusHistory(core, id);
    expect(hist[0]).toMatchObject({ ancien: "nouveau", nouveau: "en_cours", origine: "ia" });
    expect(hist[0]?.preuve).toContain("Shopify");
    core.close();
  });

  it("reste Nouveau si le besoin n'est pas qualifié ou si le client n'a pas répondu", () => {
    const core = testCore();
    const id = newLead(core);
    evaluateLeadsFor(core, WA, T0 + 5 * H);
    expect(statutOf(core, id)).toBe("nouveau");
    core.messages.insert(WA, "user", "salut ça va", null, T0 + H);
    evaluateLeadsFor(core, WA, T0 + 6 * H);
    expect(statutOf(core, id)).toBe("nouveau");
    core.close();
  });

  it("→ Devis envoyé seulement pour une vraie proposition chiffrée", () => {
    const core = testCore();
    const id = newLead(core, WA, { besoin: "LLC", score: 4 });
    core.messages.insert(WA, "user", "ok je suis intéressé", null, T0 + H);
    core.messages.insert(WA, "assistant", "La formule Prestige est à 945 €.", null, T0 + 2 * H);
    evaluateLeadsFor(core, WA, T0 + 3 * H);
    expect(statutOf(core, id)).toBe("en_cours");
    core.messages.insert(WA, "human", "Voici ton devis : LLC Wyoming Prestige 945 € tout compris", null, T0 + 4 * H);
    evaluateLeadsFor(core, WA, T0 + 5 * H);
    expect(statutOf(core, id)).toBe("devis_envoye");
    core.close();
  });

  it("un client silencieux n'est JAMAIS classé perdu", () => {
    const core = testCore();
    const id = newLead(core, WA, { besoin: "LLC", score: 4 });
    core.messages.insert(WA, "assistant", "Tu as pu regarder les formules ?", null, T0 + H);
    evaluateLeadsFor(core, WA, T0 + 400 * H);
    expect(statutOf(core, id)).not.toBe("perdu");
    core.close();
  });

  it("un abandon explicite passe la fiche en Perdu, et le retour du client la remet En cours", () => {
    const core = testCore();
    const id = newLead(core, WA, { besoin: "LLC", score: 4 });
    core.messages.insert(WA, "user", "Finalement je laisse tomber, ça ne m'intéresse plus", null, T0 + H);
    evaluateLeadsFor(core, WA, T0 + 2 * H);
    expect(statutOf(core, id)).toBe("perdu");
    core.messages.insert(WA, "user", "Salut, en fait je suis de nouveau intéressé par la LLC", null, T0 + 3 * H);
    evaluateLeadsFor(core, WA, T0 + 4 * H);
    expect(statutOf(core, id)).toBe("en_cours");
    expect(leadStatusHistory(core, id).map((h) => h.nouveau)).toEqual(["en_cours", "perdu"]);
    core.close();
  });

  it("un paiement non confirmé n'est jamais « Gagné »", () => {
    const core = testCore();
    const id = newLead(core, WA, { besoin: "LLC", score: 5 });
    core.messages.insert(WA, "user", "ok je veux payer maintenant, j'ai payé par virement", null, T0 + H);
    core.messages.insert(WA, "human", "Voici ton devis : LLC Wyoming 799 €", null, T0 + 2 * H);
    evaluateLeadsFor(core, WA, T0 + 3 * H);
    expect(statutOf(core, id)).toBe("devis_envoye");
    // Gagné : uniquement avec une donnée de paiement fiable (ou un administrateur).
    expect(confirmLeadWon(core, id, "stripe", "pi_123")).toBe(true);
    expect(statutOf(core, id)).toBe("gagne");
    expect(leadStatusHistory(core, id)[0]?.motif).toContain("stripe");
    core.close();
  });

  it("Gagné n'est jamais modifié par l'IA ; un nouvel achat crée une nouvelle fiche sans effacer l'ancienne", () => {
    const core = testCore();
    const premier = newLead(core, WA, { besoin: "LLC", score: 5 });
    setLeadStatusHuman(core, premier, "gagne");
    core.messages.insert(WA, "user", "Je laisse tomber", null, T0 + 10 * H);
    evaluateLeadsFor(core, WA, T0 + 11 * H);
    expect(statutOf(core, premier)).toBe("gagne");
    core.leads.insert(WA, { offre: "Formation", besoin: "formation vinted", budget: "300 €", delai: "", score: 4 });
    const second = (core.sqlite.prepare(`SELECT MAX(id) AS id FROM leads WHERE wa_id = ?`).get(WA) as { id: number }).id;
    expect(second).not.toBe(premier);
    expect(core.leads.list().filter((l) => l.waId === WA)).toHaveLength(2);
    core.close();
  });
});

describe("corrections manuelles respectées", () => {
  it("une correction humaine n'est pas écrasée par d'anciens messages", () => {
    const core = testCore();
    const id = newLead(core, WA, { besoin: "LLC", score: 4 });
    core.messages.insert(WA, "human", "Voici ton devis : LLC 945 €", null, T0 + H);
    // Jacob remet à « En cours » : le devis ANTÉRIEUR ne doit pas le repasser en « Devis envoyé ».
    setLeadStatusHuman(core, id, "devis_envoye");
    setLeadStatusHuman(core, id, "en_cours");
    evaluateLeadsFor(core, WA, Date.now() + H);
    expect(statutOf(core, id)).toBe("en_cours");
    const hist = leadStatusHistory(core, id);
    expect(hist.filter((h) => h.origine === "humain")).toHaveLength(2);
    core.close();
  });

  it("un « Perdu » posé à la main n'est pas annulé immédiatement par un message du client", () => {
    const core = testCore();
    const id = newLead(core, WA, { besoin: "LLC", score: 4 });
    setLeadStatusHuman(core, id, "perdu");
    const now = Date.now();
    core.messages.insert(WA, "user", "attends je réfléchis encore à la LLC", null, now + 60_000);
    evaluateLeadsFor(core, WA, now + 120_000);
    expect(statutOf(core, id)).toBe("perdu");
    // Plus tard (après le délai de grâce), un vrai retour peut le rouvrir.
    core.messages.insert(WA, "user", "bonjour je veux finalement lancer ma LLC", null, now + 8 * H);
    evaluateLeadsFor(core, WA, now + 9 * H);
    expect(statutOf(core, id)).toBe("en_cours");
    core.close();
  });
});
