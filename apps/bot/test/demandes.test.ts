import { categoryCounts, categoryDetail, classifyDemande, reclassifyQuestions, setQuestionCategory } from "@arbi/core";
import { describe, expect, it } from "vitest";
import { testCore } from "./helpers";

const WA = "33600000042";
const T0 = Date.UTC(2026, 10, 10, 10, 0);
const H = 3_600_000;

function addQ(core: ReturnType<typeof testCore>, wa: string, texte: string, ts: number, categorie = "Autre") {
  core.sqlite
    .prepare(`INSERT INTO questions (wa_id, texte, normalise, intention, categorie, repondue, created_at) VALUES (?, ?, ?, 'information', ?, 1, ?)`)
    .run(wa, texte, texte.toLowerCase(), categorie, ts);
}
const cls = (core: ReturnType<typeof testCore>, texte: string, ts = T0, wa = WA) => classifyDemande(core, { waId: wa, texte, ts });

describe("classement des demandes : ce qui compte (ou non) comme demande", () => {
  it("les salutations, remerciements et confirmations ne sont jamais des demandes", () => {
    const core = testCore();
    for (const t of ["Salam", "bonjour ça va ?", "ok merci", "d'accord parfait", "merci beaucoup", "[Image reçue]", ""]) {
      expect(cls(core, t).demande, t).toBe(false);
    }
    core.close();
  });

  it("une vraie demande est comptée dans sa catégorie précise, pas dans « Autre »", () => {
    const core = testCore();
    expect(cls(core, "Vous avez des drones DJI Mini 4 ?")).toMatchObject({ categorie: "Drones DJI", demande: true });
    expect(cls(core, "Je veux créer une LLC au Wyoming", T0 + H, "336x")).toMatchObject({ categorie: "Société", demande: true });
    expect(cls(core, "tu fais des applications mobiles ?", T0 + 2 * H, "336y")).toMatchObject({ categorie: "Digital", demande: true });
    core.close();
  });

  it("« Autre » = vraie demande sans aucune catégorie reconnue, jamais un message incompris", () => {
    const core = testCore();
    expect(cls(core, "Vous faites des tatouages ?")).toMatchObject({ categorie: "Autre", demande: true });
    // Message sans demande identifiable : exclu, pas rangé dans « Autre ».
    expect(cls(core, "je suis à Lyon en ce moment")).toMatchObject({ demande: false });
    core.close();
  });

  it("un message qui prolonge une demande déjà comptée n'est pas une nouvelle demande (contexte analysé)", () => {
    const core = testCore();
    addQ(core, WA, "Vous vendez des drones DJI ?", T0, "Drones DJI");
    core.sqlite.prepare(`UPDATE questions SET demande = 1`).run();
    // « et le prix ? » : court, mais dans la même demande → suite, classée dans la catégorie du contexte.
    const suite = cls(core, "et le prix ?", T0 + H);
    expect(suite).toMatchObject({ categorie: "Drones DJI", demande: false });
    expect(suite.raison).toContain("déjà comptée");
    // 3 jours plus tard : nouvelle demande, dans la même catégorie (le sujet en cours).
    expect(cls(core, "et le prix ?", T0 + 3 * 24 * H)).toMatchObject({ categorie: "Drones DJI", demande: true });
    core.close();
  });

  it("le même client qui répète la même demande dans la journée n'est compté qu'une fois ; le lendemain, oui", () => {
    const core = testCore();
    addQ(core, WA, "Vous avez des drones DJI ?", T0, "Drones DJI");
    expect(cls(core, "Vous avez des drones DJI Avata ?", T0 + 3 * H).demande).toBe(false);
    expect(cls(core, "Vous avez des drones DJI Avata ?", T0 + 30 * H).demande).toBe(true);
    // Un AUTRE client compte séparément.
    expect(cls(core, "Vous avez des drones DJI ?", T0 + H, "33699999999").demande).toBe(true);
    core.close();
  });
});

describe("recalcul des anciennes données + cohérence compteurs / détail", () => {
  function seedOld(core: ReturnType<typeof testCore>) {
    core.contacts.upsert(WA, "Karim");
    addQ(core, WA, "Vous avez des drones DJI ?", T0);
    addQ(core, WA, "ok merci beaucoup c'est gentil", T0 + H); // politesse classée « Autre » à tort
    addQ(core, WA, "et le prix ?", T0 + 2 * H); // suite
    addQ(core, WA, "je veux une LLC", T0 + 5 * H);
    addQ(core, WA, "Vous faites des tatouages ?", T0 + 6 * H);
  }

  it("recalcule sans rien supprimer, et les compteurs = les lignes consultables", () => {
    const core = testCore();
    seedOld(core);
    const avant = (core.sqlite.prepare(`SELECT COUNT(*) n FROM questions`).get() as { n: number }).n;
    const r = reclassifyQuestions(core);
    expect(r).toMatchObject({ total: 5, comptees: 3, exclues: 2 });
    expect((core.sqlite.prepare(`SELECT COUNT(*) n FROM questions`).get() as { n: number }).n).toBe(avant);
    const counts = categoryCounts(core, T0 - H, T0 + 24 * H);
    expect(Object.fromEntries(counts.map((c) => [c.categorie, c.n]))).toEqual({ "Drones DJI": 1, "Société": 1, Autre: 1 });
    for (const c of counts) {
      const d = categoryDetail(core, c.categorie, T0 - H, T0 + 24 * H);
      expect(d.total).toBe(c.n);
      expect(d.items).toHaveLength(c.n);
    }
    // Les exclues restent consultables avec leur raison.
    const exclues = categoryDetail(core, "Drones DJI", T0 - H, T0 + 24 * H, { exclues: true });
    expect(exclues.items[0]?.raison).toContain("déjà comptée");
    core.close();
  });

  it("le détail donne le client, la date, le message exact et le contexte", () => {
    const core = testCore();
    seedOld(core);
    core.messages.insert(WA, "user", "Salut", null, T0 - 60_000);
    core.messages.insert(WA, "assistant", "Bonjour ! Que puis-je faire pour toi ?", null, T0 - 30_000);
    core.messages.insert(WA, "user", "Vous avez des drones DJI ?", null, T0);
    core.messages.insert(WA, "assistant", "Oui, on a les DJI Mini 4.", null, T0 + 20_000);
    reclassifyQuestions(core);
    const d = categoryDetail(core, "Drones DJI", T0 - H, T0 + 24 * H).items[0]!;
    expect(d).toMatchObject({ nom: "Karim", waId: WA, ts: T0, texte: "Vous avez des drones DJI ?" });
    expect(d.avant.map((m) => m.contenu)).toContain("Bonjour ! Que puis-je faire pour toi ?");
    expect(d.apres?.contenu).toBe("Oui, on a les DJI Mini 4.");
    core.close();
  });

  it("correction manuelle : les statistiques bougent, et un nouveau recalcul ne l'annule pas", () => {
    const core = testCore();
    seedOld(core);
    reclassifyQuestions(core);
    const tat = (core.sqlite.prepare(`SELECT id FROM questions WHERE texte LIKE '%tatouages%'`).get() as { id: number }).id;
    expect(setQuestionCategory(core, tat, "Digital")).toBe(true);
    expect(setQuestionCategory(core, tat, "Catégorie inventée")).toBe(false);
    let counts = Object.fromEntries(categoryCounts(core, T0 - H, T0 + 24 * H).map((c) => [c.categorie, c.n]));
    expect(counts).toEqual({ "Drones DJI": 1, "Société": 1, Digital: 1 });
    reclassifyQuestions(core);
    counts = Object.fromEntries(categoryCounts(core, T0 - H, T0 + 24 * H).map((c) => [c.categorie, c.n]));
    expect(counts.Digital).toBe(1);
    // « Pas une demande » retire la ligne des statistiques.
    expect(setQuestionCategory(core, tat, null)).toBe(true);
    expect(categoryCounts(core, T0 - H, T0 + 24 * H).some((c) => c.categorie === "Digital")).toBe(false);
    core.close();
  });
});
