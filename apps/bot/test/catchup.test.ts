import { describe, expect, it } from "vitest";
import { testCore } from "./helpers";
import { answerUnanswered } from "../src/catchup";

const H = 3600_000;
describe("Rattrapage des messages restés sans réponse", () => {
  it("répond seulement aux dernières demandes sans réponse, dans la fenêtre, une seule fois", async () => {
    const core = testCore();
    const now = Date.now();
    const pushed: Array<[string, string]> = [];
    const deps = { core, push: (w: string, i: { text: string }) => void pushed.push([w, i.text]), isDirector: (w: string) => w === "DIR", log: { info: () => {} }, now, pauseMs: 0 };
    for (const w of ["A", "B", "C", "D", "E", "DIR"]) core.contacts.upsert(w);
    core.messages.insert("A", "user", "q1", "a1", now - 3 * H);
    core.messages.insert("A", "user", "q2", "a2", now - 2 * H);          // 2 messages sans réponse → regroupés
    core.messages.insert("B", "user", "vieux", "b1", now - 30 * H);        // hors fenêtre
    core.messages.insert("C", "user", "q", "c1", now - H);
    core.messages.insert("C", "assistant", "déjà répondu", "c2", now - H + 5); // déjà répondu
    core.messages.insert("D", "user", "stop", "d1", now - H);
    core.contacts.setOptOut("D", true);
    core.messages.insert("E", "user", "humain", "e1", now - H);
    core.contacts.setModeHumain("E", true);
    core.messages.insert("DIR", "user", "jacob", "g1", now - H);
    const r = await answerUnanswered(deps);
    expect(pushed).toEqual([["A", "q1\nq2"]]);
    expect(r.horsFenetre).toBe(1);
    await answerUnanswered(deps);
    expect(pushed).toHaveLength(1);
  });
});
