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
    const env = setup([{ tool: "ask_director", input: { question: "Prix du Starlink ?" } }, { text: "" }]);
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
    const env = setup([{ tool: "ask_director", input: { question: "Prix Falcon Pro ?" } }, { text: "Avec plaisir !" }]);
    await clientSays(env, "Combien le Falcon Pro ?");
    await clientSays(env, "ok merci");
    await clientSays(env, "??");
    expect(toClient(env)).toHaveLength(1);
    // Jacob traite l'alerte depuis l'onglet Jacob → le bot reprend
    env.core.alerts.markTreated(env.core.alerts.open()[0]!.id);
    await clientSays(env, "et pour la livraison ?");
    expect(toClient(env)).toHaveLength(2);
    env.core.close();
  });

  it("même webhook rejoué 3 fois : une seule alerte, un seul message", async () => {
    const env = setup([{ tool: "ask_director", input: { question: "Samsung ?" } }, { text: "" }]);
    env.core.messages.insert(CLIENT, "user", "T'as des Samsung ?");
    for (let i = 0; i < 3; i++) await env.handle(CLIENT, [{ text: "T'as des Samsung ?" }]);
    expect(toClient(env)).toHaveLength(1);
    expect(env.core.alerts.countOpen()).toBe(1);
    env.core.close();
  });
});

describe("V9.1 — paiement : boutique d'abord, numéro de Jacob seulement en secours", () => {
  it("le prompt impose le lien boutique et réserve niveau4 au paiement impossible", () => {
    const p = buildStaticPrompt("catalogue", [], [], [], "", "autonome", [], true);
    expect(p).toContain("chinacces.com/products");
    expect(p).toContain("tu n'envoies PAS le numéro de Jacob");
    expect(p).toContain("niveau4_humain UNIQUEMENT si le paiement sur la boutique est impossible");
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
    expect(sys).toContain("Telegram n'est PAS un canal de contact");
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
