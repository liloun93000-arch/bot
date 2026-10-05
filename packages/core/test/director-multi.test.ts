import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { escalateToDirector, handleDirectorReply, pickEscalation, type DirectorDeps } from "../src/director";
import { bestMatches, confidenceLevel } from "../src/knowledge";
import { silentLogger, testCore } from "./helpers";

const JACOB = "33778783701";

const noLlm = { messages: { create: async () => { throw new Error("off"); } } } as unknown as Anthropic;

/** LLM simulé : structure la connaissance, rédige la réponse client, juge « distinct ». */
function fakeLlm(structured: Record<string, unknown>) {
  return {
    messages: {
      create: async (req: { system?: string }) => {
        const sys = String(req.system ?? "");
        let text = "distinct";
        if (sys.includes("CONNAISSANCE MÉTIER")) text = JSON.stringify(structured);
        else if (sys.includes("assistant WhatsApp")) text = "Oui 👍 ce modèle est disponible sur commande, compte environ 2 semaines de délai.";
        return { content: [{ type: "text", text }] };
      },
    },
  } as unknown as Anthropic;
}

function fakeWa() {
  const sent: Array<{ to: string; text: string; kind: string }> = [];
  let n = 0;
  const wa = {
    sendText: async (to: string, text: string) => { sent.push({ to, text, kind: "text" }); return { sent: true, messageId: `wamid.${++n}` }; },
    sendTemplate: async (to: string, name: string) => { sent.push({ to, text: name, kind: "template" }); return { sent: true, messageId: `wamid.${++n}` }; },
    uploadMedia: async () => "media.1",
    sendMedia: async (to: string, _k: string, _id: string, o: { caption?: string }) => { sent.push({ to, text: o.caption ?? "", kind: "image" }); return { sent: true, messageId: `wamid.${++n}` }; },
  };
  return { wa, sent };
}

function setup(llm: Anthropic = noLlm) {
  const core = testCore();
  core.settings.set("admin_numbers", [{ number: `+${JACOB}`, actif: true }]);
  const { wa, sent } = fakeWa();
  const deps = { core, wa, llm, model: "x", log: silentLogger(), readMedia: async () => Buffer.from("img") } as unknown as DirectorDeps;
  return { core, deps, sent };
}

const PHOTO = [{ file: "a.jpg", mime: "image/jpeg" }];

describe("Manager IA — photos, demandes simultanées, vocal", () => {
  it("T3 photo + question inconnue : la photo ET la question partent à Jacob dans UN message", async () => {
    const { core, deps, sent } = setup();
    core.contacts.upsert("33611111111", "Yanis");
    const r = await escalateToDirector(deps, { waId: "33611111111", question: "Vous avez celui-ci ?", media: PHOTO, contexte: "Photo (analyse du bot) : sac à main beige" });
    expect(r.photoSent).toBe(true);
    const img = sent.find((s) => s.kind === "image" && s.to === JACOB)!;
    expect(img.text).toContain("Vous avez celui-ci ?");
    expect(img.text).toMatch(/Réponds directement à ce message/);
    const esc = core.knowledge.escalations.byWamid("wamid.1")!;
    expect(esc.mediaFile).toBe("a.jpg");
    expect(esc.contexte).toContain("sac à main");
  });

  it("T4 trois clients, trois questions → trois demandes distinctes ; photos jamais fusionnées", async () => {
    const { core, deps, sent } = setup();
    for (const [id, n] of [["33611111111", "A"], ["33622222222", "B"], ["33633333333", "C"]] as const) core.contacts.upsert(id, n);
    const a = await escalateToDirector(deps, { waId: "33611111111", question: "Vous avez celui-ci ?", media: PHOTO });
    const b = await escalateToDirector(deps, { waId: "33622222222", question: "Vous avez celui-ci ?", media: [{ file: "b.jpg", mime: "image/jpeg" }] });
    const c = await escalateToDirector(deps, { waId: "33633333333", question: "Livrez-vous en Belgique ?" });
    expect(new Set([a.escalationId, b.escalationId, c.escalationId]).size).toBe(3);
    expect(sent.filter((s) => s.to === JACOB).length).toBe(3);
    expect(core.knowledge.escalations.countOpen()).toBe(3);
  });

  it("T5 + T9 « Répondre » sur la 2e demande : seul le client 2 reçoit, statut résolu, les autres restent en attente", async () => {
    const { core, deps, sent } = setup();
    for (const [id, n] of [["33611111111", "A"], ["33622222222", "B"], ["33633333333", "C"]] as const) core.contacts.upsert(id, n);
    await escalateToDirector(deps, { waId: "33611111111", question: "Livrez-vous en Belgique ?" });
    await escalateToDirector(deps, { waId: "33622222222", question: "Faites-vous des devis pour un mariage à l'étranger ?" });
    await escalateToDirector(deps, { waId: "33633333333", question: "Proposez-vous un accompagnement visa étudiant ?" });
    // Les wamid envoyés à Jacob : 1, 2, 3 (dans l'ordre). Jacob répond à la 2e.
    const out = await handleDirectorReply(deps, { adminWaId: JACOB, text: "Oui c'est disponible, devis sous 48h.", replyToWamid: "wamid.2" });
    expect(out.handled).toBe(true);
    expect(out.delivered).toBe(1);
    expect(sent.some((s) => s.to === "33622222222")).toBe(true);
    expect(sent.some((s) => s.to === "33611111111")).toBe(false);
    expect(sent.some((s) => s.to === "33633333333")).toBe(false);
    const kb = core.knowledge.escalations;
    expect(kb.byWamid("wamid.2")!.statut).toBe("resolue");
    expect(kb.byWamid("wamid.1")!.statut).toBe("en_attente");
    expect(kb.byWamid("wamid.3")!.statut).toBe("en_attente");
  });

  it("T8 message libre sans « Répondre » avec plusieurs demandes ouvertes : aucune devinette, rien envoyé aux clients", async () => {
    const { core, deps, sent } = setup();
    core.contacts.upsert("33611111111", "Marie");
    core.contacts.upsert("33622222222", "Karim");
    await escalateToDirector(deps, { waId: "33611111111", question: "Livrez-vous en Belgique ?" });
    await escalateToDirector(deps, { waId: "33622222222", question: "Faites-vous des devis pour un mariage à l'étranger ?", media: PHOTO });
    const before = sent.length;
    const out = await handleDirectorReply(deps, { adminWaId: JACOB, text: "Oui c'est possible" });
    expect(out.handled).toBe(true);
    expect(out.escalationId).toBeUndefined();
    const msg = sent.slice(before);
    expect(msg.length).toBe(1);
    expect(msg[0]!.to).toBe(JACOB);
    expect(msg[0]!.text).toContain("Marie");
    expect(msg[0]!.text).toContain("Karim");
    expect(msg[0]!.text).toContain("📷");
    expect(msg[0]!.text).toMatch(/Répondre/);
    expect(core.knowledge.escalations.countOpen()).toBe(2);
    expect(core.knowledge.entries.active().length).toBe(0);
  });

  it("un simple « ok » avec une seule demande ouverte n'est pas rattaché d'office", async () => {
    const { core, deps } = setup();
    core.contacts.upsert("33611111111", "Marie");
    await escalateToDirector(deps, { waId: "33611111111", question: "Livrez-vous en Belgique ?" });
    expect(pickEscalation(core, { adminWaId: JACOB, text: "ok merci" }).esc).toBeUndefined();
    expect(pickEscalation(core, { adminWaId: JACOB, text: "Oui on livre" }).esc).toBeDefined();
  });

  it("T6/T7 réponse vocale (texte transcrit) à une demande avec photo : contexte conservé, le bot rédige sa propre réponse", async () => {
    const llm = fakeLlm({ sujet: "iPhone 15 Pro bleu", theme: "Disponibilité", categorie: "Autre", offre_cle: "", intention: "L'iPhone 15 Pro bleu est-il disponible ?", reponse: "L'iPhone 15 Pro bleu est disponible sur commande, environ 2 semaines de délai.", conditions: "Délai d'environ 2 semaines", exceptions: "", nature: "nouvelle", memoriser: true });
    const { core, deps, sent } = setup(llm);
    core.contacts.upsert("33611111111", "Yanis");
    await escalateToDirector(deps, { waId: "33611111111", question: "Vous avez celui-ci ?", media: PHOTO, contexte: "Photo (analyse du bot) : iPhone 15 Pro bleu" });
    // Transcription Whisper d'un vocal de Jacob : « [Message vocal] … » (préfixe retiré par le handler)
    const transcript = "[Message vocal] Oui celui-là on peut l'avoir mais il faut compter environ deux semaines.";
    const jacobText = transcript.replace(/^\[Message vocal\]\s*/i, "");
    const out = await handleDirectorReply(deps, { adminWaId: JACOB, text: jacobText, replyToWamid: "wamid.1" });
    expect(out.delivered).toBe(1);
    const toClient = sent.filter((s) => s.to === "33611111111");
    expect(toClient.length).toBe(1);
    expect(toClient[0]!.text).not.toContain("[Message vocal]");
    expect(toClient[0]!.text).toMatch(/2 semaines/);
    expect(core.knowledge.escalations.byWamid("wamid.1")!.statut).toBe("resolue");
  });

  it("T10 l'information apprise via une photo est réutilisable pour un autre client", async () => {
    const llm = fakeLlm({ sujet: "iPhone 15 Pro bleu", theme: "Disponibilité", categorie: "Autre", offre_cle: "", intention: "Avez-vous l'iPhone 15 Pro bleu en stock ?", reponse: "L'iPhone 15 Pro bleu est disponible sur commande, environ 2 semaines de délai.", conditions: "", exceptions: "", nature: "nouvelle", memoriser: true });
    const { core, deps } = setup(llm);
    core.contacts.upsert("33611111111", "Yanis");
    await escalateToDirector(deps, { waId: "33611111111", question: "Vous avez celui-ci ?", media: PHOTO, contexte: "iPhone 15 Pro bleu" });
    await handleDirectorReply(deps, { adminWaId: JACOB, text: "Oui sur commande, 2 semaines.", replyToWamid: "wamid.1" });
    const entries = core.knowledge.entries.active();
    expect(entries.length).toBe(1);
    const m = bestMatches(entries, "Vous avez l'iPhone 15 Pro bleu en stock ?")[0]!;
    expect(confidenceLevel(m.score)).not.toBe("faible");
  });

  it("une réponse sur photo sans IA (article non identifié) est transmise mais PAS mémorisée", async () => {
    const { core, deps, sent } = setup();
    core.contacts.upsert("33611111111", "Yanis");
    await escalateToDirector(deps, { waId: "33611111111", question: "Vous avez celui-ci ?", media: PHOTO });
    const out = await handleDirectorReply(deps, { adminWaId: JACOB, text: "Oui celui-là", replyToWamid: "wamid.1" });
    expect(out.delivered).toBe(1);
    expect(core.knowledge.entries.active().length).toBe(0);
    expect(sent.some((s) => s.to === "33611111111")).toBe(true);
  });

  it("T9b fenêtre client fermée / échec d'envoi : la demande passe en ERREUR, pas « résolue »", async () => {
    const { core, deps, sent } = setup();
    core.contacts.upsert("33611111111", "Marie");
    await escalateToDirector(deps, { waId: "33611111111", question: "Livrez-vous en Belgique ?" });
    (deps.wa as unknown as { sendText: (to: string, t: string) => Promise<unknown> }).sendText = async (to: string, text: string) => {
      if (to === "33611111111") return { sent: false, reason: "outside_24h_window" };
      sent.push({ to, text, kind: "text" });
      return { sent: true, messageId: "wamid.x" };
    };
    const out = await handleDirectorReply(deps, { adminWaId: JACOB, text: "Oui on livre en Belgique.", replyToWamid: "wamid.1" });
    expect(out.delivered).toBe(0);
    expect(core.knowledge.escalations.byWamid("wamid.1")!.statut).toBe("erreur");
    expect(sent[sent.length - 1]!.text).toContain("⚠️");
  });

  it("répondre (Répondre) à une demande déjà traitée = correction, aucun nouveau message client", async () => {
    const { core, deps, sent } = setup();
    core.contacts.upsert("33611111111", "Marie");
    await escalateToDirector(deps, { waId: "33611111111", question: "Livrez-vous en Belgique ?" });
    await handleDirectorReply(deps, { adminWaId: JACOB, text: "Oui on livre en Belgique.", replyToWamid: "wamid.1" });
    const toClient = sent.filter((s) => s.to === "33611111111").length;
    const out = await handleDirectorReply(deps, { adminWaId: JACOB, text: "Finalement non, pas la Belgique.", replyToWamid: "wamid.1" });
    expect(out.handled).toBe(true);
    expect(sent.filter((s) => s.to === "33611111111").length).toBe(toClient);
  });
});
