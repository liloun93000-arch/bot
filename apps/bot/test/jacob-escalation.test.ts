import { handleDirectorReply } from "@arbi/core";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { SalesAgent } from "../src/agent";
import { createHandler } from "../src/handler";
import { escalateAndAck, looksLikeNoAnswer, stripJacobNumbers } from "../src/escalation";
import { fakeLlm, fakeWa, silentLogger, testAlertDeps, testCore } from "./helpers";

const CLIENT = "33612345678";
const CLIENT2 = "33698765432";
const JACOB = "33699999999";

type Step = { text: string } | { tool: string; input: Record<string, unknown> };

/** Faux LLM scénarisé : renvoie du texte ou un appel d'outil, et mémorise ce que le modèle a reçu. */
function scripted(steps: Step[]) {
  let i = 0;
  const seen: Array<{ system: string; messages: unknown }> = [];
  const client = {
    seen,
    get calls() {
      return i;
    },
    messages: {
      create: async (params: { system?: Array<{ text: string }> | string; messages: unknown }) => {
        seen.push({
          system: Array.isArray(params.system) ? params.system.map((b) => b.text).join("\n") : String(params.system ?? ""),
          messages: params.messages,
        });
        const step = steps[Math.min(i, steps.length - 1)] as Step;
        i++;
        if ("tool" in step) {
          return {
            stop_reason: "tool_use",
            content: [{ type: "tool_use", id: `tu_${i}`, name: step.tool, input: step.input }],
          };
        }
        return { stop_reason: "end_turn", content: [{ type: "text", text: step.text }] };
      },
    },
  };
  return client as typeof client & Anthropic;
}

function setup(steps: Step[], opts: { withPhoto?: boolean } = {}) {
  const core = testCore(`+${JACOB}`);
  core.contacts.upsert(CLIENT, "Karim");
  const wa = fakeWa();
  const llm = scripted(steps);
  const alertDeps = testAlertDeps(core, wa, { llm });
  const readMedia = async () => Buffer.from("fake-jpeg");
  const agent = new SalesAgent({
    core,
    client: llm,
    model: "test-model",
    wa,
    alertDeps,
    log: silentLogger(),
    readBotFile: readMedia,
  });
  const handle = createHandler({ core, wa, agent, alertDeps, log: silentLogger(), readMedia, llm, model: "test-model" });
  return { core, wa, llm, handle, agent };
}

/** Message client : inséré en base (comme le webhook) puis traité comme un batch. */
async function clientSays(env: ReturnType<typeof setup>, text: string, waId = CLIENT) {
  env.core.messages.insert(waId, "user", text);
  await env.handle(waId, [{ text }]);
}

const toClient = (env: ReturnType<typeof setup>, waId = CLIENT) =>
  env.wa.sent.filter((s) => s.waId === waId && (s.kind === "text" || s.kind === "buttons"));
const digitsOf = (t = "") => t.replace(/\D/g, "");

describe("TEST 7/8/9/10/11 — question inconnue", () => {
  it("aucun numéro, UN SEUL message client, alerte interne visible, demande dans l'onglet Jacob", async () => {
    const env = setup([{ tool: "ask_director", input: { question: "Avez-vous la Cartier Santos en stock ?" } }, { text: "" }]);
    await clientSays(env, "Vous avez la Cartier Santos en stock ?");

    const msgs = toClient(env);
    expect(msgs).toHaveLength(1); // TEST 8 : un seul message
    expect(msgs[0]?.text).toContain("transmettre");
    expect(msgs[0]?.text).toContain("Jacob");
    const contact = String(env.core.settings.get("contact_direct"));
    expect(digitsOf(msgs[0]?.text)).not.toContain(digitsOf(contact).slice(-9)); // TEST 7 : pas de numéro
    expect(digitsOf(msgs[0]?.text)).not.toContain(JACOB.slice(-9));
    expect(env.wa.sent.some((s) => s.kind === "buttons")).toBe(false); // pas de bouton « réponse rapide »

    // TEST 9/10/11 : la demande existe, est « en attente », et le compteur (badge) = 1
    expect(env.core.knowledge.escalations.countOpen()).toBe(1);
    const open = env.core.knowledge.escalations.open()[0];
    expect(open?.waId).toBe(CLIENT);
    expect(open?.question).toContain("Cartier Santos");
    // Jacob a reçu la question sur WhatsApp
    expect(env.wa.sent.some((s) => s.waId === JACOB)).toBe(true);
    env.core.close();
  });

  it("le même message traité DEUX fois (retry / webhook rejoué) n'envoie rien de plus", async () => {
    const env = setup([{ tool: "ask_director", input: { question: "Stock Cartier Santos ?" } }, { text: "" }]);
    env.core.messages.insert(CLIENT, "user", "Stock Cartier Santos ?");
    await env.handle(CLIENT, [{ text: "Stock Cartier Santos ?" }]);
    await env.handle(CLIENT, [{ text: "Stock Cartier Santos ?" }]); // TEST 15 : même événement rejoué
    await env.handle(CLIENT, [{ text: "Stock Cartier Santos ?" }]);
    expect(toClient(env)).toHaveLength(1);
    expect(env.core.knowledge.escalations.countOpen()).toBe(1);
    env.core.close();
  });

  it("le client relance : le modèle rappelle ask_director → toujours UN seul message client", async () => {
    const env = setup([{ tool: "ask_director", input: { question: "Stock Cartier Santos ?" } }, { text: "" }]);
    await clientSays(env, "Stock Cartier Santos ?");
    await clientSays(env, "alors ça en est où ?");
    await clientSays(env, "??");
    expect(toClient(env)).toHaveLength(1);
    expect(env.core.knowledge.escalations.countOpen()).toBe(1);
    env.core.close();
  });

  it("escalateAndAck appelé deux fois pour la même demande : un seul accusé", async () => {
    const env = setup([{ text: "x" }]);
    env.core.messages.insert(CLIENT, "user", "question");
    const e = { core: env.core, wa: env.wa, llm: env.llm, model: "m", log: silentLogger() };
    const a = await escalateAndAck(e, { waId: CLIENT, question: "Question inconnue X" });
    const b = await escalateAndAck(e, { waId: CLIENT, question: "Question inconnue X" });
    expect(a.ackSent).toBe(true);
    expect(b.ackSent).toBe(false);
    expect(b.deduped).toBe(true);
    expect(toClient(env)).toHaveLength(1);
    env.core.close();
  });

  it("niveau4_humain avec un motif « info inconnue » est redirigé : pas de numéro, pas de boutons", async () => {
    const env = setup([{ tool: "niveau4_humain", input: { motif: "information absente de la base" } }, { text: "" }]);
    await clientSays(env, "Vous livrez à Dubaï en 48h ?");
    const msgs = toClient(env);
    expect(msgs).toHaveLength(1);
    expect(env.wa.sent.some((s) => s.kind === "buttons")).toBe(false);
    expect(digitsOf(msgs[0]?.text)).not.toContain(digitsOf(String(env.core.settings.get("contact_direct"))).slice(-9));
    expect(env.core.knowledge.escalations.countOpen()).toBe(1);
    env.core.close();
  });

  it("une réponse « je n'ai pas l'information » du modèle devient une vraie escalade", async () => {
    const env = setup([{ text: "Désolé, je n'ai pas cette information pour le moment." }]);
    await clientSays(env, "Vous réparez les MacBook Air M1 ?");
    const msgs = toClient(env);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.text).not.toContain("pas cette information");
    expect(msgs[0]?.text).toContain("Jacob");
    expect(env.core.knowledge.escalations.countOpen()).toBe(1);
    env.core.close();
  });

  it("le modèle écrit le numéro de Jacob dans sa réponse : la phrase est retirée", async () => {
    const env = setup([{ text: `Je te confirme les délais. Écris à Jacob au ${"+33 7 78 78 37 01"} pour la suite.` }]);
    await clientSays(env, "Vous êtes ouverts le dimanche ?");
    const t = toClient(env).map((m) => m.text).join(" ");
    expect(digitsOf(t)).not.toContain("778783701");
    expect(t).toContain("Je te confirme les délais");
    env.core.close();
  });

  it("le client demande un humain : validation interne de Jacob, aucun numéro, un seul message", async () => {
    const env = setup([{ text: "ne doit pas être appelé" }]);
    await clientSays(env, "je veux parler à Jacob");
    const msgs = toClient(env);
    expect(msgs).toHaveLength(1);
    expect(digitsOf(msgs[0]?.text)).not.toContain(digitsOf(String(env.core.settings.get("contact_direct"))).slice(-9));
    expect(env.wa.sent.some((s) => s.kind === "buttons")).toBe(false);
    expect(env.core.knowledge.escalations.countOpen()).toBe(1);
    await clientSays(env, "je veux parler à Jacob");
    expect(toClient(env)).toHaveLength(1);
    env.core.close();
  });

  it("le parcours de PAIEMENT garde son contact (logique de paiement inchangée)", async () => {
    const env = setup([{ tool: "niveau4_humain", input: { motif: "le client veut payer par virement" } }, { text: "" }]);
    await clientSays(env, "ok je veux payer par virement, comment on fait ?");
    expect(env.wa.sent.some((s) => s.kind === "buttons")).toBe(true);
    env.core.close();
  });
});

describe("TEST 12/13/14 — photos", () => {
  it("photo + question inconnue : la photo accompagne la demande envoyée à Jacob et reste visible", async () => {
    const env = setup([{ tool: "ask_director", input: { question: "Vous avez celui-ci ?" } }, { text: "" }]);
    env.core.messages.insert(CLIENT, "user", "[Photo du client — analyse automatique] Un sac en cuir noir, marque illisible.", "wamid.IMG1", Date.now(), {
      type: "image",
      file: "wamid.IMG1.jpg",
      mime: "image/jpeg",
    });
    await clientSays(env, "Vous avez celui-ci ?");
    const esc = env.core.knowledge.escalations.open()[0];
    expect(esc?.mediaFile).toBe("wamid.IMG1.jpg"); // la photo est rattachée à la demande (visible dans l'onglet Jacob)
    expect(env.wa.sent.some((s) => s.waId === JACOB && s.kind === "media")).toBe(true); // et envoyée à Jacob sur WhatsApp
    expect(esc?.contexte).toContain("sac en cuir noir"); // analyse du bot jointe au contexte
    // l'image est bien conservée dans la conversation (pas seulement « Image reçue »)
    const row = env.core.messages.history(CLIENT, 10).find((m) => m.mediaFile);
    expect(row?.mediaMime).toBe("image/jpeg");
    env.core.close();
  });

  it("la description de la photo est transmise au modèle (photo analysable)", async () => {
    const env = setup([{ text: "Oui, ce modèle existe, je te donne les prix." }]);
    env.core.messages.insert(CLIENT, "user", "[Photo du client — analyse automatique] iPhone 15 Pro titane naturel, écran fissuré.", "wamid.IMG2", Date.now(), {
      type: "image",
      file: "wamid.IMG2.jpg",
      mime: "image/jpeg",
    });
    await clientSays(env, "Vous le réparez ?");
    const sentToModel = JSON.stringify(env.llm.seen[0]?.messages);
    expect(sentToModel).toContain("iPhone 15 Pro titane naturel");
    env.core.close();
  });
});

describe("TEST 16/17/18 — statistiques par QUESTION", () => {
  it("conversation mixte : 2 réponses autonomes + 1 intervention Jacob = 67 %", async () => {
    const env = setup([
      { text: "Oui, bien sûr, on fait des casquettes." },
      { tool: "ask_director", input: { question: "Avez-vous des casquettes brodées en 48h ?" } },
      { text: "" },
      { text: "Les tarifs commencent dès 25 € la pièce." },
    ]);
    await clientSays(env, "vous faites des casquettes ?");
    await clientSays(env, "et en brodé livré en 48h ?");
    await clientSays(env, "et le prix de base ?");
    const s = env.core.questions.autonomy(0);
    expect(s.autonomes).toBe(2);
    expect(s.jacob).toBe(1);
    expect(s.total).toBe(3);
    expect(s.taux).toBe(67);
    env.core.close();
  });

  it("un « je n'ai pas l'information » n'est JAMAIS compté comme résolution automatique", async () => {
    const env = setup([{ text: "Je n'ai pas les connaissances nécessaires pour répondre." }]);
    await clientSays(env, "vous faites du dropshipping ?");
    const s = env.core.questions.autonomy(0);
    expect(s.autonomes).toBe(0);
    expect(s.jacob).toBe(1);
    expect(s.taux).toBe(0);
    env.core.close();
  });

  it("l'historique non classé est ignoré (jamais compté comme résolu)", () => {
    const core = testCore();
    core.questions.record({ waId: CLIENT, texte: "a", normalise: "a", intention: "", categorie: "Autre", repondue: true });
    expect(core.questions.autonomy(0).total).toBe(0);
    expect(core.questions.autonomy(0).taux).toBeNull();
    core.close();
  });
});

describe("TEST 19/20 — Jacob répond, le bot apprend", () => {
  it("la réponse de Jacob devient une connaissance structurée (pas la phrase brute) réutilisée avec un autre client", async () => {
    const env = setup([{ tool: "ask_director", input: { question: "Le sac Louis Vuitton Neverfull est-il disponible ?" } }, { text: "" }]);
    await clientSays(env, "Vous avez le Neverfull ?");
    const jacobSentence = "Oui, celui-là on peut l'avoir mais faut compter deux semaines.";
    const structured = JSON.stringify({
      sujet: "Louis Vuitton Neverfull",
      theme: "disponibilite",
      categorie: "Autre",
      offre_cle: "",
      intention: "Le Neverfull est-il disponible ?",
      reponse: "Louis Vuitton Neverfull : disponible sur commande, délai d'environ 2 semaines.",
      conditions: "Délai : environ 2 semaines (sur commande).",
      exceptions: "",
      nature: "nouvelle",
      memoriser: true,
    });
    const out = await handleDirectorReply(
      { core: env.core, wa: env.wa, llm: fakeLlm(structured), model: "x", log: silentLogger() },
      { adminWaId: JACOB, text: jacobSentence },
    );
    expect(out.handled).toBe(true);
    const entry = env.core.knowledge.entries.active()[0];
    expect(entry).toBeDefined();
    expect(entry?.reponse).not.toBe(jacobSentence); // pas la phrase brute
    expect(entry?.reponse).toContain("2 semaines");
    expect(entry?.reponseJacob).toBe(jacobSentence); // la trace d'origine est conservée à part
    // le client attendait : il a reçu la réponse (en plus de l'accusé initial)
    expect(env.core.knowledge.escalations.countOpen()).toBe(0); // badge retombe à 0
    expect(env.core.knowledge.escalations.closed(5)[0]?.statut).toMatch(/resolue|repondue/);

    // Un AUTRE client pose la même question : la connaissance est injectée dans le contexte du modèle.
    const env2llm = scripted([{ text: "Oui, il est disponible sur commande, comptez environ 2 semaines." }]);
    const wa2 = fakeWa();
    const agent2 = new SalesAgent({
      core: env.core,
      client: env2llm,
      model: "m",
      wa: wa2,
      alertDeps: testAlertDeps(env.core, wa2),
      log: silentLogger(),
    });
    const handle2 = createHandler({ core: env.core, wa: wa2, agent: agent2, alertDeps: testAlertDeps(env.core, wa2), log: silentLogger() });
    env.core.contacts.upsert(CLIENT2);
    env.core.messages.insert(CLIENT2, "user", "Le Neverfull Louis Vuitton est dispo ?");
    await handle2(CLIENT2, [{ text: "Le Neverfull Louis Vuitton est dispo ?" }]);
    expect(env2llm.seen[0]?.system).toContain("2 semaines");
    expect(env.core.knowledge.escalations.countOpen()).toBe(0); // pas de nouvelle escalade : le bot sait
    env.core.close();
  });

  it("apprentissage du TON (exemples) et connaissances métier restent séparés : un exemple ne devient jamais un tarif autorisé", async () => {
    const core = testCore();
    const before = core.knowledge.entries.count();
    core.examples.add?.({ question: "Combien pour un site ?", reponse: "Pour un site c'est 9999 € tout compris." } as never);
    expect(core.knowledge.entries.count()).toBe(before); // les exemples n'alimentent pas la base de connaissances
    core.close();
  });
});

describe("garde-fous unitaires", () => {
  it("looksLikeNoAnswer reconnaît les aveux d'ignorance sans toucher aux vraies réponses", () => {
    expect(looksLikeNoAnswer("Je n'ai pas les connaissances nécessaires")).toBe(true);
    expect(looksLikeNoAnswer("Je ne sais pas te répondre sur ce point")).toBe(true);
    expect(looksLikeNoAnswer("Oui, on fait des casquettes à partir de 25 €.")).toBe(false);
    expect(looksLikeNoAnswer("Je ne sais pas si tu préfères le noir ou le blanc, dis-moi.")).toBe(false);
  });
  it("stripJacobNumbers retire la phrase quelle que soit la mise en forme du numéro", () => {
    const r = stripJacobNumbers("Ok. Appelle-le au 07 78 78 37 01 ! Bonne journée.", ["+33 7 78 78 37 01"]);
    expect(r.stripped).toBe(true);
    expect(r.text).not.toContain("37 01");
    expect(r.text).toContain("Bonne journée");
  });
});
