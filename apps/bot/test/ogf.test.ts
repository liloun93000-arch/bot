import { describe, expect, it } from "vitest";
import { createHandler } from "../src/handler";
import { mentionsOgf, ogfReply } from "../src/ogf";
import { fakeLlm, fakeWa, silentLogger, testAlertDeps, testCore } from "./helpers";

const CLIENT = "33612345678";

describe("OG Factory : redirection directe", () => {
  it("reconnaît OG Factory / OGF / OGFACTORY, pas les autres mots", () => {
    for (const t of ["Ça fait 4 mois j'ai commandé chez ogf ?!", "OG FACTORY svp", "ogfactory", "og-factory", "je cherche OGF."]) expect(mentionsOgf([t]), t).toBe(true);
    for (const t of ["bonjour", "ogfoo", "mogf", "je veux une LLC"]) expect(mentionsOgf([t]), t).toBe(false);
  });

  it("le message de la capture : coordonnées données, aucune alerte, aucun appel IA", async () => {
    const core = testCore("+33699999999");
    core.contacts.upsert(CLIENT, "Karim");
    const wa = fakeWa();
    const llm = fakeLlm("ne doit pas être appelé");
    const handle = createHandler({
      core, wa, alertDeps: testAlertDeps(core, wa, { llm }), log: silentLogger(), llm, model: "m",
      agent: { respond: async () => { throw new Error("l'agent ne doit pas être appelé"); } } as never,
    } as never);
    const text = "Ça fait 4 mois j ai commandé chez ogf ?!";
    core.messages.insert(CLIENT, "user", text);
    await handle(CLIENT, [{ text }]);
    const out = wa.sent.filter((s) => s.waId === CLIENT && s.kind === "text").map((s) => s.text).join("\n");
    expect(out).toContain("https://www.ogfactory.shop");
    expect(out).toContain("+33 7 80 96 29 20");
    expect(out).toContain("@Ogfactoryshop_bot");
    expect(out).not.toMatch(/Jacob/);
    expect(core.alerts.countOpen()).toBe(0);
    core.close();
  });

  it("message neutre sur OGF : coordonnées sans ton de réclamation", () => {
    expect(ogfReply(["vous avez le catalogue ogf ?"])).toMatch(/^Pour OG Factory, voici/);
    expect(ogfReply(["4 mois sans nouvelles d'ogf"])).toMatch(/agacement/);
  });
});
