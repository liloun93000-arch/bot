import { describe, expect, it } from "vitest";
import { testCore } from "./helpers";
import { resendFailedMessages } from "../src/resend-failed";

const H = 3600_000;
function setup() {
  const core = testCore();
  const now = Date.now();
  const sent: Array<[string, string]> = [];
  const log = { info: () => {}, warn: () => {} };
  const sendText = async (w: string, t: string) => { sent.push([w, t]); return { sent: true, messageId: `new-${sent.length}` }; };
  const fail = (wa: string, text: string, ts: number, wamid: string, code = 131042) => {
    core.contacts.upsert(wa, "Test");
    core.messages.insert(wa, "assistant", text, wamid, ts);
    core.delivery.record({ wamid, status: "failed", ts, waId: wa, errorCode: code, errorMessage: "x" });
  };
  return { core, now, sent, log, sendText, fail };
}

describe("Renvoi des messages refusés pour paiement", () => {
  it("renvoie dans la fenêtre 24 h, une seule fois, et corrige le « Non envoyé »", async () => {
    const t = setup();
    t.core.contacts.upsert("A", "A");
    t.core.messages.insert("A", "user", "salut", "in1", t.now - 2 * H);
    t.fail("A", "réponse 1", t.now - 2 * H + 1000, "w1");
    const r1 = await resendFailedMessages({ core: t.core, sendText: t.sendText, log: t.log, now: t.now, pauseMs: 0 });
    expect(r1.renvoyes).toBe(1);
    expect(t.sent).toEqual([["A", "réponse 1"]]);
    const r2 = await resendFailedMessages({ core: t.core, sendText: t.sendText, log: t.log, now: t.now, pauseMs: 0 });
    expect(r2.renvoyes).toBe(0);
    expect(t.sent).toHaveLength(1);
  });

  it("n'envoie rien hors fenêtre 24 h, aux désinscrits, ni après une réponse déjà livrée; ignore les autres erreurs", async () => {
    const t = setup();
    t.core.contacts.upsert("B"); t.core.messages.insert("B", "user", "vieux", "in2", t.now - 30 * H);
    t.fail("B", "trop tard", t.now - 29 * H, "w2");
    t.core.contacts.upsert("C"); t.core.messages.insert("C", "user", "stop", "in3", t.now - H);
    t.fail("C", "désinscrit", t.now - H + 1, "w3");
    t.core.contacts.setOptOut("C", true);
    t.core.contacts.upsert("D"); t.core.messages.insert("D", "user", "q", "in4", t.now - 3 * H);
    t.fail("D", "périmée", t.now - 3 * H + 1, "w4");
    t.core.messages.insert("D", "assistant", "livrée", "w5", t.now - 2 * H);
    t.core.delivery.record({ wamid: "w5", status: "delivered", ts: t.now - 2 * H, waId: "D" });
    t.core.contacts.upsert("E"); t.core.messages.insert("E", "user", "q", "in5", t.now - H);
    t.fail("E", "autre erreur", t.now - H + 1, "w6", 131047);
    const r = await resendFailedMessages({ core: t.core, sendText: t.sendText, log: t.log, now: t.now, pauseMs: 0 });
    expect(t.sent).toEqual([]);
    expect(r.horsFenetre).toBe(1);
  });
});
