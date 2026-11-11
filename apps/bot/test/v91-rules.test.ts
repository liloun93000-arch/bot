import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { SalesAgent } from "../src/agent";
import { createHandler } from "../src/handler";
import { installCatalogues } from "../src/catalog-seed";
import { isPaymentStage } from "../src/escalation";
import { buildStaticPrompt } from "../src/prompt";
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


describe("V9.1 — question inconnue : ALERTE, Jacob reprend la conversation", () => {
  it("info absente (Starlink) : alerte complète, UN message, aucun numéro, aucune demande WhatsApp « question »", async () => {
    const env = setup([{ tool: "ask_director", input: { question: "Prix du Starlink ?" } }, { text: "Le prix du Starlink, je ne l'ai pas sous la main : je fais remonter à Jacob, il revient vers toi ici même. En attendant, dis-moi pour quel usage tu le veux ?" }]);
    await clientSays(env, "Le Starlink c'est combien ?");
    const msgs = toClient(env);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.text).toContain("Jacob");
    expect(digitsOf(msgs[0]?.text)).not.toContain(digitsOf(String(env.core.settings.get("contact_direct"))).slice(-9));
    expect(env.core.alerts.countOpen()).toBe(1);
    expect(env.core.alerts.open()[0]?.motif).toContain("Starlink");
    expect(env.core.knowledge.escalations.countOpen()).toBe(0);
    env.core.close();
  });

  it("TEST 24 — « ok merci » après l'alerte : aucune nouvelle réponse (Jacob reprend la main)", async () => {
    const env = setup([
      { tool: "ask_director", input: { question: "Prix Falcon Pro ?" } },
      { text: "Le Falcon Pro est dispo, prix sur demande : je fais remonter à Jacob, il revient vers toi ici même." },
      { text: "Pour la livraison, compte 15 jours ouvrables." },
    ]);
    await clientSays(env, "Combien le Falcon Pro ?");
    await clientSays(env, "ok merci");
    await clientSays(env, "d'accord 👍");
    expect(toClient(env)).toHaveLength(1); // aucun message en trop
    expect(env.core.alerts.countOpen()).toBe(1);
    // Une vraie question : le bot continue de répondre (script, section 14 : ne pas laisser le client en plan)
    await clientSays(env, "et pour la livraison ?");
    expect(toClient(env)).toHaveLength(2);
    expect(env.core.alerts.countOpen()).toBe(1);
    env.core.close();
  });

  it("même webhook rejoué 3 fois : une seule alerte, un seul message", async () => {
    const env = setup([{ tool: "ask_director", input: { question: "Samsung ?" } }, { text: "Pas chez ce fournisseur, mais je lance la recherche : je fais remonter à Jacob, il revient vers toi ici même." }]);
    env.core.messages.insert(CLIENT, "user", "T'as des Samsung ?");
    for (let i = 0; i < 3; i++) await env.handle(CLIENT, [{ text: "T'as des Samsung ?" }]);
    expect(toClient(env)).toHaveLength(1);
    expect(env.core.alerts.countOpen()).toBe(1);
    env.core.close();
  });
});

describe("V9.1 — paiement : boutique d'abord, numéro de Jacob seulement en secours", () => {
  it("le prompt impose le lien du produit et réserve le numéro aux deux cas de la section 11", () => {
    const p = buildStaticPrompt("catalogue", [], [], [], "", "autonome", [], true);
    expect(p).toContain("LIEN DU PRODUIT");
    expect(p).toContain("uniquement dans les deux cas de la section 11");
    expect(p).toContain("Une question de prix ne mène JAMAIS à Jacob");
  });

  it("« J'ai pas de carte, PayPal ça passe ? » ouvre le secours (numéro + boutons)", async () => {
    expect(isPaymentStage("J'ai pas de carte, PayPal ça passe ?")).toBe(true);
    const env = setup([{ tool: "niveau4_humain", input: { motif: "paiement impossible sur la boutique (PayPal)" } }, { text: "" }]);
    await clientSays(env, "J'ai pas de carte, PayPal ça passe ?");
    const msgs = toClient(env);
    expect(msgs).toHaveLength(1);
    expect(digitsOf(msgs[0]?.text)).toContain(digitsOf(String(env.core.settings.get("contact_direct"))).slice(-9));
    expect(msgs[0]?.text).toContain("boutique");
    env.core.close();
  });

  it("« Je paie comment ? » avec le lien boutique : le lien part, pas le numéro", async () => {
    const env = setup([{ text: "Tu peux régler directement ici : https://chinacces.com/products/fournisseur-apple" }]);
    await clientSays(env, "Je prends l'accès Apple, je paie comment ?");
    const msgs = toClient(env);
    expect(msgs.map((m) => m.text).join(" ")).toContain("https://chinacces.com/products/fournisseur-apple");
    expect(digitsOf(msgs.map((m) => m.text).join(" "))).not.toContain(digitsOf(String(env.core.settings.get("contact_direct"))).slice(-9));
    env.core.close();
  });
});

describe("V9.1 — Telegram, honnêteté, langue", () => {
  it("plus aucun lien ni groupe Telegram dans ce qui est envoyé au modèle", async () => {
    const env = setup([{ text: "Bonjour !" }]);
    await clientSays(env, "Bonjour, je veux voir des exemples");
    const all = env.llm.seen.map((x) => x.system).join("\n");
    // Les instructions (hors contenu du catalogue, qui sera remplacé par la V9.1) ne citent plus Telegram.
    const sys = all.replace(/<catalogue>[\s\S]*?<\/catalogue>/g, "");
    expect(sys).not.toContain("t.me/");
    expect(sys).toContain("Telegram n'est pas un canal de contact : jamais pour joindre Jacob");
    expect(sys).toContain("tu ne mens pas");
    expect(sys).toContain("langue du client");
    env.core.close();
  });
});

describe("V9.1 — catalogues PDF installés automatiquement", () => {
  it("les 4 PDF entrent dans « Fichiers du bot », les anciens PDF périmés sont désactivés, une seule fois", async () => {
    const core = testCore();
    const seed = mkdtempSync(join(tmpdir(), "seed-"));
    const media = mkdtempSync(join(tmpdir(), "media-"));
    for (const f of ["APPLE_TECH", "VEHICULES", "DRONES", "VOLANTS"]) writeFileSync(join(seed, `CATALOGUE_${f}_CHINA_ACCESS.pdf`), "%PDF-1.4");
    core.botFiles.create({ cle: "catalogue_drones_arbi", nom: "Catalogue drones ARBI JACOB", description: "", fichier: "old.pdf", mime: "application/pdf", kind: "document", taille: 1 });
    core.botFiles.create({ cle: "plaquette", nom: "Plaquette", description: "", fichier: "p.pdf", mime: "application/pdf", kind: "document", taille: 1 });
    await installCatalogues(core, seed, media, silentLogger());
    await installCatalogues(core, seed, media, silentLogger());
    const actifs = core.botFiles.actifs().map((f) => f.cle).sort();
    expect(actifs).toEqual(["catalogue_apple", "catalogue_drones", "catalogue_vehicules", "catalogue_volants", "plaquette"]);
    core.close();
  });

  it("l'ancien message « je n'ai pas les connaissances… écris à Jacob » est remplacé", async () => {
    const core = testCore();
    const { NIVEAU4_MESSAGE_V8 } = await import("@arbi/core");
    core.settings.set("niveau4_message", NIVEAU4_MESSAGE_V8);
    await installCatalogues(core, mkdtempSync(join(tmpdir(), "s-")), mkdtempSync(join(tmpdir(), "m-")), silentLogger());
    expect(String(core.settings.get("niveau4_message"))).toContain("boutique");
    core.close();
  });
});

describe("V9.1 — rythme des réponses (bloc 1)", () => {
  it("délai proportionnel : 1 s minimum, 4 s maximum", async () => {
    const { replyDelayMs } = await import("../src/pacing");
    expect(replyDelayMs("250 €, à vie.")).toBe(1000);
    expect(replyDelayMs(Array(85).fill("mot").join(" "))).toBeGreaterThanOrEqual(2500);
    expect(replyDelayMs(Array(1000).fill("mot").join(" "))).toBe(4000);
  });

  it("une grille longue part en 2 ou 3 messages, une réponse courte en un seul", async () => {
    const { splitReply } = await import("../src/pacing");
    expect(splitReply("Court.")).toHaveLength(1);
    const long = Array.from({ length: 12 }, (_, i) => `Bloc ${i}\n` + "iPhone 18 Pro Max 256 Go 1 204 – 1 388 €\n".repeat(3)).join("\n\n");
    const parts = splitReply(long);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.length).toBeLessThanOrEqual(3);
    expect(parts.join(" ").replace(/\s+/g, " ").trim()).toBe(long.replace(/\s+/g, " ").trim());
  });
});

describe("V9.1 — script installé en entier, en tête du prompt", () => {
  it("le script V9.1 complet remplace le catalogue une seule fois, et figure en tête du prompt", async () => {
    const { installScript } = await import("../src/catalog-seed");
    const core = testCore();
    const path = join(mkdtempSync(join(tmpdir(), "v91-")), "script.txt");
    writeFileSync(path, "SCRIPT COMPLET — BOT CHINA ACCESS\n...\nFIN DU SCRIPT V9.1\n=====\n");
    expect(await installScript(core, path, silentLogger())).toBe(true);
    expect(core.catalogue.current().contenu).toContain("FIN DU SCRIPT V9.1");
    expect(await installScript(core, path, silentLogger())).toBe(false);
    const p = buildStaticPrompt(core.catalogue.current().contenu, [], [], [], "", "autonome", [], true);
    expect(p.startsWith("<catalogue>\nSCRIPT COMPLET — BOT CHINA ACCESS")).toBe(true);
    core.close();
  });

  it("un fichier tronqué (sans « FIN DU SCRIPT V9.1 ») n'est jamais installé", async () => {
    const { installScript } = await import("../src/catalog-seed");
    const core = testCore();
    const path = join(mkdtempSync(join(tmpdir(), "v91-")), "script.txt");
    writeFileSync(path, "SCRIPT COMPLET — BOT CHINA ACCESS\n... coupé");
    expect(await installScript(core, path, silentLogger())).toBe(false);
    core.close();
  });

  it("le vrai fichier livré est complet (63 sections, marqueur de fin)", async () => {
    const { readFileSync } = await import("node:fs");
    const txt = readFileSync(join(__dirname, "../../../data/catalogue.md"), "utf8");
    expect(txt.trimEnd().endsWith("=")).toBe(true);
    expect(txt).toContain("FIN DU SCRIPT V9.1");
    expect(txt).toMatch(/^63\. /m);
  });
});

describe("Telegram : seulement @OGFactoryBot pour les produits à l'unité", () => {
  it("un lien t.me ou une mention de Telegram est retiré ; la redirection @OGFactoryBot reste", async () => {
    const env = setup([
      { text: "Pour un exemplaire, vois le revendeur de confiance : @OGFactoryBot sur Telegram.\nRejoins aussi le groupe : https://t.me/+abc\nOn en parle aussi sur Telegram." },
    ]);
    await clientSays(env, "je veux juste une paire pour moi");
    const out = toClient(env).map((m) => m.text).join("\n");
    expect(out).toContain("@OGFactoryBot");
    expect(out).not.toContain("t.me");
    expect(out).not.toContain("On en parle aussi sur Telegram");
    env.core.close();
  });
});

describe("Bug réel : « je transmets à Jacob » sans alerte, puis « ok merci bien »", () => {
  it("l'annonce crée l'alerte (onglet Jacob), le « ok merci bien » n'efface rien et n'appelle pas de réponse", async () => {
    const env = setup([{ text: "Je transmets ta demande à Jacob, il revient vers toi ici même." }, { text: "Avec plaisir, bonne journée !" }]);
    await clientSays(env, "J'ai un souci avec ma commande, le lien ne marche pas");
    expect(env.core.alerts.countOpen()).toBe(1);
    await clientSays(env, "OK MERCI BIEN");
    expect(toClient(env)).toHaveLength(1);
    expect(env.core.alerts.countOpen()).toBe(1);
    env.core.close();
  });

  it("détection des annonces de transmission", async () => {
    const { claimsHandoffToJacob } = await import("../src/escalation");
    for (const t of [
      "Je transmets ta demande à Jacob.",
      "Je fais remonter à Jacob, il revient vers toi ici même.",
      "J'ai transmis ta question à Jacob.",
      "Jacob va revenir vers vous rapidement.",
      "Je vais prévenir Jacob.",
    ]) expect(claimsHandoffToJacob(t)).toBe(true);
    for (const t of ["Le 18 Pro Max : 1 204 à 1 388 €.", "Jacob est le formateur de China Access."]) expect(claimsHandoffToJacob(t)).toBe(false);
  });
});

describe("Bug réel : « je transmets à Jacob » sans alerte, puis « OK MERCI BIEN »", () => {
  it("l'annonce crée l'alerte (onglet Jacob), et « OK MERCI BIEN » ne reçoit aucune réponse", async () => {
    const env = setup([
      { text: "Je comprends le souci, je transmets ta demande à Jacob, il revient vers toi ici même." },
      { text: "Avec plaisir, bonne journée !" },
    ]);
    await clientSays(env, "J'ai un problème avec ma commande, rien reçu");
    expect(env.core.alerts.countOpen()).toBe(1);
    await clientSays(env, "OK MERCI BIEN");
    expect(toClient(env)).toHaveLength(1);
    expect(env.core.alerts.countOpen()).toBe(1); // reste dans l'onglet Jacob tant que Jacob n'a pas traité
    env.core.close();
  });

  it("les formulations d'annonce sont reconnues, une réponse normale non", async () => {
    const { claimsHandoffToJacob: promisesJacob } = await import("../src/escalation");
    for (const t of ["Je fais remonter à Jacob.", "Jacob va te revenir rapidement.", "Ta demande est transmise.", "Je vois avec Jacob et je reviens vers toi.", "Il vous recontacte ici."]) {
      expect(promisesJacob(t)).toBe(true);
    }
    for (const t of ["Le 18 Pro Max 256 Go est à 1 204 €.", "Avec plaisir, bonne journée !", "Jacob est le formateur de China Access."]) {
      expect(promisesJacob(t)).toBe(false);
    }
  });
});

describe("Catégories précises, questions sans réponse, vitesse", () => {
  it("catégories précises des demandes", async () => {
    const { fineCategory } = await import("@arbi/core");
    expect(fineCategory("Combien le 18 Pro Max ?")).toBe("FRS iPhone / Apple");
    expect(fineCategory("Un volant carbone pour BMW F30")).toBe("Volants");
    expect(fineCategory("Vous avez des Surron ?")).toBe("Surron / véhicules électriques");
    expect(fineCategory("Combien le Mavic 4 Pro ?")).toBe("Drones DJI");
    expect(fineCategory("La formation China Access c'est quoi ?")).toBe("Formation China Access");
    expect(fineCategory("Et pour Vinted ?")).toBe("Vinted");
    expect(fineCategory("27K snap c'est combien ?")).toBe("Snapchat (comptes)");
  });

  it("question restée sans réponse → alerte ; Jacob répond → elle sort de la liste", async () => {
    const env = setup([{ text: "" }, { text: "" }]);
    // Le modèle ne produit rien et l'escalade est refusée : la question ne doit pas rester invisible.
    await clientSays(env, "Vous livrez au Maroc ?");
    expect(env.core.questions.unanswered().length).toBeGreaterThanOrEqual(1);
    expect(env.core.alerts.countOpen() + env.core.knowledge.escalations.countOpen()).toBeGreaterThanOrEqual(1);
    // Jacob répond lui-même depuis le tableau de bord
    env.core.messages.insert(CLIENT, "human", "Oui on livre au Maroc, 10 jours.");
    expect(env.core.questions.unanswered()).toHaveLength(0);
    env.core.close();
  });
});

describe("Question marquée TRAITÉE : plus jamais dans « sans réponse »", () => {
  it("alerte marquée traitée → ses questions disparaissent, y compris les anciennes", () => {
    const core = testCore();
    core.contacts.upsert(CLIENT);
    core.questions.record({ waId: CLIENT, texte: "Vous livrez au Maroc ?", normalise: "", intention: "", categorie: "Livraison / délais", repondue: false });
    const id = core.alerts.create({ waId: CLIENT, categorie: "Autre", intention: "", motif: "x", resume: "", dernierMessage: "" });
    expect(core.questions.unanswered()).toHaveLength(1);
    core.alerts.markTreated(id);
    expect(core.questions.unanswered()).toHaveLength(0);
    // Ancienne ligne restée à 0 en base (avant ce correctif) : masquée quand même.
    core.sqlite.prepare("UPDATE questions SET repondue = 0").run();
    expect(core.questions.unanswered()).toHaveLength(0);
    // Une NOUVELLE question après le traitement réapparaît bien.
    core.questions.record({ waId: CLIENT, texte: "Et en Belgique ?", normalise: "", intention: "", categorie: "Livraison / délais", repondue: false });
    core.sqlite.prepare("UPDATE questions SET created_at = created_at + 60000 WHERE texte = 'Et en Belgique ?'").run();
    const u = core.questions.unanswered();
    expect(u.map((q) => q.texte)).toEqual(["Et en Belgique ?"]);
    core.close();
  });

  it("demande Jacob classée → ses questions disparaissent", () => {
    const core = testCore();
    core.questions.record({ waId: CLIENT, texte: "Starlink ?", normalise: "", intention: "", categorie: "Starlink", repondue: false });
    const e = core.knowledge.escalations.create({ waId: CLIENT, question: "Starlink ?", mediaFile: "", mediaMime: "", contexte: "" });
    core.knowledge.escalations.cancel(e);
    expect(core.questions.unanswered()).toHaveLength(0);
    core.close();
  });
});

describe("Top 10 : seulement les vraies questions", () => {
  it("salam, ???, ok merci, émojis ne sont pas des questions ; les vraies le sont", async () => {
    const { isRealQuestion } = await import("@arbi/core");
    for (const t of ["salam", "Salam aleykoum", "???", "…", "ok merci", "Ok merci frère 🙏", "👍", "wesh", "bonjour", "slt cv"]) {
      expect(isRealQuestion(t), t).toBe(false);
    }
    for (const t of ["Combien le 18 Pro Max ?", "prix ?", "dispo ?", "salam, t'as des Surron ?", "Vous livrez en Belgique", "Je veux la formation Vinted"]) {
      expect(isRealQuestion(t), t).toBe(true);
    }
  });

  it("un « salam » n'est jamais enregistré comme question", () => {
    const core = testCore();
    core.questions.record({ waId: CLIENT, texte: "salam", normalise: "salam", intention: "", categorie: "Autre", repondue: true });
    core.questions.record({ waId: CLIENT, texte: "Combien le Mavic 4 Pro ?", normalise: "combien le mavic 4 pro", intention: "", categorie: "Drones DJI", repondue: true });
    const n = (core.sqlite.prepare("SELECT COUNT(*) AS n FROM questions").get() as { n: number }).n;
    expect(n).toBe(1);
    core.close();
  });
});

describe("Pas d'étoiles dans les réponses", () => {
  it("retire *gras*, **titres**, # et puces *, garde liens, prix et émojis", async () => {
    const { stripMarkdown } = await import("../src/format");
    const out = stripMarkdown("**iPhone 18 Pro Max** 👌\n* 256 Go : *1 204 – 1 388 €*\n# Lien\nhttps://chinacces.com/products/fournisseur-apple\n***Neuf*** jamais activé*");
    expect(out).not.toContain("*");
    expect(out).not.toContain("#");
    expect(out).toContain("iPhone 18 Pro Max 👌");
    expect(out).toContain("- 256 Go : 1 204 – 1 388 €");
    expect(out).toContain("https://chinacces.com/products/fournisseur-apple");
  });

  it("une réponse du bot avec des étoiles part sans étoiles", async () => {
    const env = setup([{ text: "Le *Mavic 4 Pro* est à **1 536 €** 👍" }]);
    await clientSays(env, "Combien le Mavic 4 Pro ?");
    expect(toClient(env)[0]?.text).toBe("Le Mavic 4 Pro est à 1 536 € 👍");
    env.core.close();
  });
});

describe("TEST 7/8/9 — « Al Hamdûlilah et toi » : réponse naturelle, aucune alerte", () => {
  for (const msg of ["Al Hamdûlilah et toi", "HMLD et toi", "HMDL"]) {
    it(msg, async () => {
      // Même si le modèle tente une alerte, elle est refusée et il répond naturellement.
      const env = setup([{ tool: "ask_director", input: { question: msg } }, { text: "Ça va très bien merci 😊 Je peux t'aider pour quoi ?" }]);
      await clientSays(env, msg);
      expect(toClient(env).map((m) => m.text)).toEqual(["Ça va très bien merci 😊 Je peux t'aider pour quoi ?"]);
      expect(env.core.alerts.countOpen() + env.core.knowledge.escalations.countOpen()).toBe(0);
      expect(env.core.questions.unanswered()).toHaveLength(0);
      env.core.close();
    });
  }
});

describe("Pièces jointes envoyables", () => {
  it("photo, PDF, Excel, Word, PowerPoint, texte acceptés ; trop lourd refusé", async () => {
    const { checkOutboundMedia } = await import("@arbi/core");
    for (const [name, type, kind] of [
      ["photo.jpg", "image/jpeg", "image"],
      ["devis.pdf", "application/pdf", "document"],
      ["tarifs.xlsx", "", "document"],
      ["contrat.docx", "", "document"],
      ["plan.pptx", "", "document"],
      ["notes.txt", "text/plain", "document"],
    ] as const) {
      const r = checkOutboundMedia({ name, size: 1000, type });
      expect(r.ok && r.kind, name).toBe(kind);
    }
    expect(checkOutboundMedia({ name: "x.jpg", size: 6 * 1024 * 1024, type: "image/jpeg" }).ok).toBe(false);
  });
});
