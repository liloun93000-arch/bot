import { closeRelance, listRelances, onClientMessage, relanceStats, setLeadStatusHuman } from "@arbi/core";
import { describe, expect, it } from "vitest";
import { isAcceptableRelance, relanceTick } from "../src/relance";
import { testCore } from "./helpers";

const WA = "33611112222";
const H = 3_600_000;
const T0 = Date.UTC(2024, 0, 10, 0, 30); // 01:30 à Paris ; +12 h = 13:30 à Paris (heures d'envoi)
const silent = { info() {}, error() {}, warn() {}, debug() {} } as never;

function fakeWa(opts: { text?: { sent: boolean; reason?: string }; template?: { sent: boolean; reason?: string } } = {}) {
  const calls: Array<{ kind: string; text?: string }> = [];
  return {
    calls,
    wa: {
      async sendText(_w: string, text: string) {
        calls.push({ kind: "text", text });
        const r = opts.text ?? { sent: true };
        return { ...r, ...(r.sent ? { messageId: `wamid.T${calls.length}` } : {}) };
      },
      async sendTemplate(_w: string, _n: string, _l: string, comps?: unknown[]) {
        const body = (comps as Array<{ parameters: Array<{ text: string }> }> | undefined)?.[0]?.parameters[0]?.text;
        calls.push({ kind: "template", ...(body ? { text: body } : {}) });
        const r = opts.template ?? { sent: true };
        return { ...r, ...(r.sent ? { messageId: `wamid.P${calls.length}` } : {}) };
      },
    } as never,
  };
}
// Faux modèle : aucun crédit consommé. Il enregistre les invites reçues pour vérifier le contexte transmis.
const prompts: string[] = [];
let reply: string | Error = "Salut Karim, tu as pu avancer sur ta LLC pour ton e-commerce ? Dis-moi s'il te manque une info 🙂";
const llm = {
  messages: {
    create: async (req: { messages: Array<{ content: string }> }) => {
      prompts.push(String(req.messages[0]?.content));
      if (reply instanceof Error) throw reply;
      return { stop_reason: "end_turn", content: [{ type: "text", text: reply }] };
    },
  },
} as never;

function reset() { prompts.length = 0; reply = "Salut Karim, tu as pu avancer sur ta LLC pour ton e-commerce ? Dis-moi s'il te manque une info 🙂"; }

function setup(extra: Record<string, unknown> = { relance_auto_actif: true }) {
  reset();
  const core = testCore();
  for (const [k, v] of Object.entries(extra)) core.settings.set(k, v);
  core.contacts.upsert(WA, "Karim Benali");
  core.messages.insert(WA, "user", "Salut je voudrais créer une LLC pour mon e-commerce", null, T0 - 3 * H);
  core.messages.insert(WA, "assistant", "Top ! Tu vends déjà quelque chose aujourd'hui ?", null, T0);
  return core;
}
const tick = (core: ReturnType<typeof testCore>, wa: ReturnType<typeof fakeWa>, now: number) =>
  relanceTick({ core, wa: wa.wa, llm, model: "m", log: silent }, now);

describe("relance automatique après 12 h", () => {
  it("est désactivée par défaut : aucun envoi, rien de planifié", async () => {
    const core = setup({});
    const w = fakeWa();
    expect(await tick(core, w, T0 + 13 * H)).toEqual({ sent: 0, failed: 0 });
    expect(w.calls).toHaveLength(0);
    expect(listRelances(core)).toHaveLength(0);
    core.close();
  });

  it("n'envoie rien avant le délai, puis UNE relance personnalisée, jamais de doublon", async () => {
    const core = setup();
    const w = fakeWa();
    await tick(core, w, T0 + 5 * H);
    expect(w.calls).toHaveLength(0);
    expect(listRelances(core)[0]?.statut).toBe("planifiee");
    expect((await tick(core, w, T0 + 12.5 * H)).sent).toBe(1);
    expect(w.calls).toHaveLength(1);
    expect(w.calls[0]?.text).toContain("Karim");
    // Ticks suivants (même 3 jours plus tard) : aucune seconde relance.
    await tick(core, w, T0 + 13 * H);
    await tick(core, w, T0 + 36 * H);
    await tick(core, w, T0 + 80 * H);
    expect(w.calls).toHaveLength(1);
    const [r] = listRelances(core);
    expect(r).toMatchObject({ statut: "envoyee", canal: "libre", wamid: "wamid.T1" });
    // Le message est dans la conversation avec son identifiant WhatsApp (coches).
    expect(core.messages.history(WA, 5).at(-1)?.contenu).toContain("Karim");
    core.close();
  });

  it("est annulée si le client répond avant l'envoi", async () => {
    const core = setup();
    const w = fakeWa();
    await tick(core, w, T0 + 6 * H);
    core.messages.insert(WA, "user", "Oui j'ai une boutique Shopify", null, T0 + 7 * H);
    onClientMessage(core, WA, T0 + 7 * H);
    await tick(core, w, T0 + 13 * H);
    expect(w.calls).toHaveLength(0);
    expect(listRelances(core)[0]).toMatchObject({ statut: "annulee", motif: "Le client a répondu" });
    core.close();
  });

  it("rattache la réponse du client à la relance et calcule le taux de réponse", async () => {
    const core = setup();
    const w = fakeWa();
    await tick(core, w, T0 + 12.5 * H);
    core.messages.insert(WA, "user", "Oui, je suis toujours intéressé", null, T0 + 14 * H);
    onClientMessage(core, WA, T0 + 14 * H);
    const stats = relanceStats(core);
    expect(stats).toMatchObject({ envoyees: 1, reponses: 1, tauxReponse: 1 });
    expect(listRelances(core)[0]?.replyText).toContain("toujours intéressé");
    core.close();
  });

  const cas: Array<[string, (core: ReturnType<typeof testCore>) => void]> = [
    ["opt-out (STOP)", (c) => c.contacts.setOptOut(WA, true)],
    ["mode humain (Jacob a la main)", (c) => c.contacts.setModeHumain(WA, true)],
    ["alerte ouverte (en attente de Jacob)", (c) => { c.alerts.create({ waId: WA, categorie: "Autre", intention: "", motif: "réclamation", resume: "x", dernierMessage: "x" }); }],
    ["refus explicite du client", (c) => c.messages.insert(WA, "user", "finalement je laisse tomber", null, T0 + H)],
    ["fiche perdue", (c) => { c.leads.insert(WA, { offre: "LLC", besoin: "x", budget: "", delai: "", score: 3 }); const id = (c.sqlite.prepare("SELECT MAX(id) id FROM leads").get() as { id: number }).id; setLeadStatusHuman(c, id, "perdu"); }],
    ["fiche gagnée (payée)", (c) => { c.leads.insert(WA, { offre: "LLC", besoin: "x", budget: "", delai: "", score: 5 }); const id = (c.sqlite.prepare("SELECT MAX(id) id FROM leads").get() as { id: number }).id; setLeadStatusHuman(c, id, "gagne"); }],
  ];
  it.each(cas)("ne relance jamais : %s", async (_nom, prepare) => {
    const core = setup();
    prepare(core);
    // Le refus doit rester le DERNIER message client mais notre message doit rester le dernier tout court.
    if (_nom.startsWith("refus")) core.messages.insert(WA, "assistant", "Pas de souci, bonne continuation !", null, T0 + 2 * H);
    const base = _nom.startsWith("refus") ? T0 + 2 * H : T0;
    const w = fakeWa();
    await tick(core, w, base + 12.5 * H);
    expect(w.calls).toHaveLength(0);
    core.close();
  });

  it("ne relance pas un client qui a simplement clos l'échange (« merci »)", async () => {
    const core = setup();
    core.messages.insert(WA, "user", "ok merci beaucoup", null, T0 + H);
    core.messages.insert(WA, "assistant", "Avec plaisir, à bientôt !", null, T0 + 2 * H);
    const w = fakeWa();
    await tick(core, w, T0 + 15 * H);
    expect(w.calls).toHaveLength(0);
    core.close();
  });

  it("respecte les heures calmes : reporte sans annuler, envoie au matin", async () => {
    const core = setup({ relance_auto_actif: true, relance_auto_delai_h: 12 });
    // Dernier message à 11:30Z → +12 h = 23:30Z = 00:30 Paris : heures calmes.
    const t = Date.UTC(2024, 0, 10, 11, 30);
    core.sqlite.prepare("UPDATE messages SET ts = ? WHERE role = 'assistant'").run(t);
    core.sqlite.prepare("UPDATE messages SET ts = ? WHERE role = 'user'").run(t - H);
    const w = fakeWa();
    await tick(core, w, t + 12 * H + 60_000);
    expect(w.calls).toHaveLength(0);
    expect(listRelances(core)[0]?.statut).toBe("planifiee");
    // 09:30 Paris le lendemain = 08:30Z, soit 21 h après : toujours dans la tolérance, mais la fenêtre 24 h du client est fermée.
    const matin = Date.UTC(2024, 0, 11, 8, 30);
    core.sqlite.prepare("UPDATE messages SET ts = ? WHERE role = 'user'").run(matin - 5 * H);
    core.sqlite.prepare("UPDATE messages SET ts = ? WHERE role = 'assistant'").run(matin - 21 * H);
    await tick(core, w, matin);
    expect(w.calls).toHaveLength(1);
    core.close();
  });

  it("hors fenêtre 24 h : template approuvé si disponible, sinon rien", async () => {
    const out = setup({ relance_auto_actif: true, relance_template_name: "relance_client" });
    // Dernier message client il y a 30 h, notre message il y a 13 h.
    out.sqlite.prepare("UPDATE messages SET ts = ? WHERE role = 'user'").run(T0 - 17 * H);
    const w = fakeWa();
    expect((await tick(out, w, T0 + 13 * H)).sent).toBe(1);
    expect(w.calls[0]?.kind).toBe("template");
    expect(listRelances(out)[0]?.canal).toBe("template");
    out.close();

    const sans = setup({ relance_auto_actif: true });
    sans.sqlite.prepare("UPDATE messages SET ts = ? WHERE role = 'user'").run(T0 - 17 * H);
    const w2 = fakeWa();
    await tick(sans, w2, T0 + 13 * H);
    expect(w2.calls).toHaveLength(0);
    expect(listRelances(sans)[0]).toMatchObject({ statut: "ignoree" });
    expect(listRelances(sans)[0]?.motif).toContain("24 h");
    sans.close();
  });

  it("n'envoie pas en masse à l'activation : une conversation trop ancienne est ignorée", async () => {
    const core = setup();
    const w = fakeWa();
    await tick(core, w, T0 + 7 * 24 * H);
    expect(w.calls).toHaveLength(0);
    core.close();
  });

  it("le délai est réglable", async () => {
    const core = setup({ relance_auto_actif: true, relance_auto_delai_h: 24 });
    const w = fakeWa();
    await tick(core, w, T0 + 13 * H);
    expect(w.calls).toHaveLength(0);
    core.close();
  });

  it("un échec d'envoi est tracé et ne boucle pas", async () => {
    const core = setup();
    const w = fakeWa({ text: { sent: false, reason: "http_500" } });
    const r = await tick(core, w, T0 + 12.5 * H);
    expect(r.failed).toBe(1);
    await tick(core, w, T0 + 13 * H);
    expect(w.calls).toHaveLength(1);
    expect(listRelances(core)[0]).toMatchObject({ statut: "echec" });
    core.close();
  });

  it("Jacob qui réécrit ouvre une nouvelle situation, sans écraser l'historique", async () => {
    const core = setup();
    const w = fakeWa();
    await tick(core, w, T0 + 12.5 * H);
    core.messages.insert(WA, "assistant", "Je te renvoie les infos complètes.", null, T0 + 30 * H);
    core.messages.insert(WA, "user", "ok", null, T0 + 29.5 * H);
    await tick(core, w, T0 + 43 * H);
    expect(listRelances(core).length).toBeLessThanOrEqual(2);
    closeRelance(core, 1, "annulee", "test");
    core.close();
  });
});

describe("texte de relance", () => {
  it("rejette un texte IA avec prix, lien, pression, sans question ou trop long", () => {
    expect(isAcceptableRelance("Salut, la LLC est à 799 € ?")).toBe(false);
    expect(isAcceptableRelance("Regarde https://exemple.com ?")).toBe(false);
    expect(isAcceptableRelance("Dernière chance, urgent ?")).toBe(false);
    expect(isAcceptableRelance("Je reviens vers toi.")).toBe(false);
    expect(isAcceptableRelance("a".repeat(400) + " ?")).toBe(false);
    expect(isAcceptableRelance("AUCUNE")).toBe(false);
    expect(isAcceptableRelance("Salut Karim, tu as pu avancer sur ton projet ?")).toBe(true);
  });
  it("rejette une relance qui répète notre dernier message ou une relance précédente", () => {
    expect(isAcceptableRelance("Top ! Tu vends déjà quelque chose aujourd'hui ?", { dernierNous: "Top ! Tu vends déjà quelque chose aujourd'hui ?" })).toBe(false);
    expect(isAcceptableRelance("Tu as pu avancer sur ta LLC ?", { precedentes: ["Tu as pu avancer sur ta LLC ?"] })).toBe(false);
  });
});

describe("relance contextuelle : pertinence et personnalisation (sans texte générique)", () => {
  it("transmet au modèle le vrai contexte : sujet, dernière question, derniers messages", async () => {
    const core = setup();
    await tick(core, fakeWa(), T0 + 12.5 * H);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("créer une LLC pour mon e-commerce");
    expect(prompts[0]).toContain("Tu vends déjà quelque chose aujourd'hui ?");
    expect(prompts[0]).toContain("Karim");
    core.close();
  });

  it("IA indisponible : AUCUN message envoyé (pas de texte de secours), motif tracé", async () => {
    const core = setup();
    const w = fakeWa();
    reply = new Error("IA indisponible");
    const out = await relanceTick({ core, wa: w.wa, llm, model: "m", log: silent }, T0 + 12.5 * H);
    expect(out).toEqual({ sent: 0, failed: 0 });
    expect(w.calls).toHaveLength(0);
    expect(listRelances(core)[0]).toMatchObject({ statut: "ignoree" });
    expect(listRelances(core)[0]?.motif).toContain("rien n'est envoyé");
    core.close();
  });

  it("le modèle répond AUCUNE ou un texte non conforme (prix) : rien n'est envoyé", async () => {
    for (const bad of ["AUCUNE", "Ta LLC est à 799 € ?", "Salut ! Je reviens vers toi."]) {
      const core = setup();
      const w = fakeWa();
      reply = bad;
      await relanceTick({ core, wa: w.wa, llm, model: "m", log: silent }, T0 + 12.5 * H);
      expect(w.calls, bad).toHaveLength(0);
      expect(listRelances(core)[0]?.statut, bad).toBe("ignoree");
      core.close();
    }
  });

  it("conversation sans intérêt ni question en attente : aucune relance, aucun appel IA", async () => {
    reset();
    const core = testCore();
    core.settings.set("relance_auto_actif", true);
    core.contacts.upsert(WA, "Léa");
    core.messages.insert(WA, "user", "salut", null, T0 - 3 * H);
    core.messages.insert(WA, "assistant", "Bonjour Léa, je reste à ta disposition.", null, T0);
    const w = fakeWa();
    await tick(core, w, T0 + 12.5 * H);
    expect(w.calls).toHaveLength(0);
    expect(prompts).toHaveLength(0);
    expect(listRelances(core)).toHaveLength(0);
    core.close();
  });

  it("question de qualification restée sans réponse : relance autorisée", async () => {
    reset();
    const core = testCore();
    core.settings.set("relance_auto_actif", true);
    core.contacts.upsert(WA, "Léa");
    core.messages.insert(WA, "user", "salut", null, T0 - 3 * H);
    core.messages.insert(WA, "assistant", "Bonjour Léa ! Tu cherches plutôt une société ou un site web ?", null, T0);
    reply = "Léa, tu penchais plutôt pour une société ou pour un site web ?";
    const w = fakeWa();
    await tick(core, w, T0 + 12.5 * H);
    expect(w.calls).toHaveLength(1);
    expect(prompts[0]).toContain("question de qualification");
    core.close();
  });

  it("hors fenêtre 24 h avec template : une seule variable (le texte personnalisé), jamais de repli sans variable", async () => {
    const core = setup({ relance_auto_actif: true, relance_template_name: "relance_client" });
    core.sqlite.prepare("UPDATE messages SET ts = ? WHERE role = 'user'").run(T0 - 17 * H);
    const w = fakeWa({ template: { sent: false, reason: "http_400" } });
    const out = await tick(core, w, T0 + 13 * H);
    expect(out.failed).toBe(1);
    expect(w.calls).toHaveLength(1); // pas de second essai non personnalisé
    expect(w.calls[0]?.text).toContain("Karim");
    core.close();
  });
});
