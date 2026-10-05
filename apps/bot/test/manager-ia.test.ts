import { handleDirectorReply } from "@arbi/core";
import { describe, expect, it } from "vitest";
import { executeTool, type ToolContext } from "../src/tools";
import { fakeLlm, fakeWa, silentLogger, testAlertDeps, testCore } from "./helpers";

const CLIENT = "33612345678";
const JACOB = "33699999999";

function ctxFor(core: ReturnType<typeof testCore>, wa: ReturnType<typeof fakeWa>): ToolContext {
  return {
    waId: CLIENT,
    core,
    wa,
    alertDeps: testAlertDeps(core, wa),
    state: core.state.get(CLIENT),
    log: silentLogger(),
    flags: { alertFired: false, niveau4Sent: false },
    lastClientMessage: "Vous faites du paiement en plusieurs fois ?",
  };
}

describe("Manager IA — outil ask_director", () => {
  it("envoie la question à Jacob au format demandé et crée une demande en attente", async () => {
    const core = testCore(`+${JACOB}`);
    core.contacts.upsert(CLIENT, "Karim");
    core.messages.insert(JACOB, "user", "ok"); // fenêtre 24 h admin ouverte → texte libre
    const wa = fakeWa();
    const out = await executeTool("ask_director", { question: "Paiement en plusieurs fois possible ?" }, ctxFor(core, wa));
    expect(out).toContain("Question envoyée à Jacob");
    const sent = wa.sent.find((s) => s.waId === JACOB);
    expect(sent?.text).toContain("🤖 ARBI JACOB — QUESTION CLIENT");
    expect(core.knowledge.escalations.countOpen()).toBe(1);
    core.close();
  });

  it("Jacob répond → la connaissance est créée et le client reçoit la réponse", async () => {
    const core = testCore(`+${JACOB}`);
    core.contacts.upsert(CLIENT, "Karim");
    core.messages.insert(CLIENT, "user", "Paiement en plusieurs fois ?");
    core.messages.insert(JACOB, "user", "ok");
    const wa = fakeWa();
    await executeTool("ask_director", { question: "Paiement en plusieurs fois possible ?" }, ctxFor(core, wa));
    const out = await handleDirectorReply(
      { core, wa, llm: fakeLlm("Oui, possible à partir de 500 €."), model: "x", log: silentLogger() },
      { adminWaId: JACOB, text: "Oui mais uniquement à partir de 500 €" },
    );
    expect(out.handled).toBe(true);
    expect(core.knowledge.entries.active().length).toBe(1);
    expect(wa.sent.some((s) => s.waId === CLIENT)).toBe(true);
    core.close();
  });
});
