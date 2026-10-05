import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { escalateToDirector, handleDirectorReply, type DirectorDeps } from "../src/director";
import { bestMatches, confidenceLevel } from "../src/knowledge";
import { silentLogger, testCore } from "./helpers";

const JACOB = "33778783701";

/** LLM éteint : force les replis déterministes (aucun appel réseau). */
const noLlm = { messages: { create: async () => { throw new Error("off"); } } } as unknown as Anthropic;

function fakeWa() {
  const sent: Array<{ to: string; text: string; kind: string }> = [];
  let n = 0;
  const wa = {
    sendText: async (to: string, text: string) => { sent.push({ to, text, kind: "text" }); return { sent: true, messageId: `wamid.${++n}` }; },
    sendTemplate: async (to: string, name: string) => { sent.push({ to, text: name, kind: "template" }); return { sent: true, messageId: `wamid.${++n}` }; },
  };
  return { wa, sent };
}

function setup() {
  const core = testCore();
  core.settings.set("admin_numbers", [{ number: `+${JACOB}`, actif: true }]);
  const { wa, sent } = fakeWa();
  const deps = { core, wa, llm: noLlm, model: "x", log: silentLogger() } as unknown as DirectorDeps;
  return { core, deps, sent };
}

describe("Manager IA — flux complet", () => {
  it("question inconnue → Jacob → réponse au bon client → connaissance → 2e client autonome", async () => {
    const { core, deps, sent } = setup();
    core.contacts.upsert("33611111111", "Marie");
    const r = await escalateToDirector(deps, { waId: "33611111111", question: "Je peux payer en plusieurs fois ?", categorie: "Autre" });
    expect(r.deduped).toBe(false);
    expect(r.notified).toBe(true);
    const toJacob = sent.find((s) => s.to === JACOB)!;
    expect(toJacob.text).toContain("🤖 ARBI JACOB — QUESTION CLIENT");
    expect(toJacob.text).toContain("Marie");

    // Jacob répond en « répondant » au message du bot (contexte de réponse)
    const wamid = "wamid.1";
    const out = await handleDirectorReply(deps, { adminWaId: JACOB, text: "Oui c'est possible, mais uniquement à partir de 500 €.", replyToWamid: wamid });
    expect(out.handled).toBe(true);
    expect(out.delivered).toBe(1);
    const toClient = sent.filter((s) => s.to === "33611111111");
    expect(toClient.length).toBe(1);
    expect(toClient[0]!.text).toMatch(/500/);
    expect(core.knowledge.escalations.countOpen()).toBe(0);

    // Connaissance créée, conditions conservées
    const entries = core.knowledge.entries.active();
    expect(entries.length).toBe(1);
    expect(entries[0]!.conditions).toMatch(/500/);

    // 2e client, autre formulation → confiance élevée, aucun nouveau message à Jacob
    const before = sent.filter((s) => s.to === JACOB).length;
    const m = bestMatches(entries, "Vous acceptez le paiement fractionné ?")[0]!;
    expect(confidenceLevel(m.score)).toBe("elevee");
    expect(sent.filter((s) => s.to === JACOB).length).toBe(before);
  });

  it("déduplique : deux clients, une seule demande, deux réponses", async () => {
    const { core, deps, sent } = setup();
    core.contacts.upsert("33611111111", "A");
    core.contacts.upsert("33622222222", "B");
    const a = await escalateToDirector(deps, { waId: "33611111111", question: "Vous faites des devis pour un mariage à l'étranger ?" });
    const b = await escalateToDirector(deps, { waId: "33622222222", question: "Est-ce que vous faites un devis pour mariage à l'étranger ?" });
    expect(b.deduped).toBe(true);
    expect(b.escalationId).toBe(a.escalationId);
    expect(sent.filter((s) => s.to === JACOB).length).toBe(1);
    const out = await handleDirectorReply(deps, { adminWaId: JACOB, text: "Oui, devis gratuit sous 48h.", replyToWamid: "wamid.1" });
    expect(out.delivered).toBe(2);
    expect(sent.some((s) => s.to === "33611111111")).toBe(true);
    expect(sent.some((s) => s.to === "33622222222")).toBe(true);
  });

  it("une correction de Jacob remplace l'ancienne connaissance et garde l'historique", async () => {
    const { core, deps } = setup();
    const oldId = core.knowledge.entries.add({ sujet: "délai de livraison", theme: "Délais", intention: "Quel est le délai de livraison ?", reponse: "Le délai est de 10 jours." });
    const out = await handleDirectorReply(deps, { adminWaId: JACOB, text: "Correction : le délai de livraison est maintenant de 15 jours." });
    expect(out.handled).toBe(true);
    expect(core.knowledge.entries.get(oldId)?.statut).toBe("remplace");
    const active = core.knowledge.entries.active();
    expect(active.length).toBe(1);
    expect(active[0]!.reponse).toMatch(/15/);
    expect(core.knowledge.entries.history(oldId).length).toBeGreaterThan(1);
  });

  it("n'intercepte rien s'il n'y a aucune demande ouverte (Jacob peut tester comme client)", async () => {
    const { deps } = setup();
    const out = await handleDirectorReply(deps, { adminWaId: JACOB, text: "Bonjour, je voudrais un site" });
    expect(out.handled).toBe(false);
  });

  it("respecte le mode humain : pas de message client automatique", async () => {
    const { core, deps, sent } = setup();
    core.contacts.upsert("33633333333", "C");
    core.contacts.setModeHumain("33633333333", true);
    await escalateToDirector(deps, { waId: "33633333333", question: "Acceptez-vous les chèques ?" });
    const out = await handleDirectorReply(deps, { adminWaId: JACOB, text: "Non, virement ou carte uniquement.", replyToWamid: "wamid.1" });
    expect(out.delivered).toBe(0);
    expect(sent.some((s) => s.to === "33633333333")).toBe(false);
    expect(core.knowledge.escalations.links(out.escalationId!)[0]!.delivery).toBe("mode_humain");
  });
});
