import { aiIdeasPrompt, analyze, resolvePeriod, setLeadStatusHuman, startOfDay } from "@arbi/core";
import { describe, expect, it } from "vitest";
import { testCore } from "./helpers";

const NOW = Date.UTC(2026, 10, 18, 14, 0); // 18/11/2026 15:00 à Paris
const DAY = 86_400_000;
const H = 3_600_000;

function client(core: ReturnType<typeof testCore>, n: number, text: string, ts = NOW - H, nom?: string) {
  const wa = `3360000${String(n).padStart(4, "0")}`;
  core.contacts.upsert(wa, nom ?? `Client ${n}`);
  core.messages.insert(wa, "user", text, null, ts);
  return wa;
}

describe("périodes", () => {
  it("aujourd'hui / hier / 7 j / 30 j / personnalisée, en heure de Paris", () => {
    const today = startOfDay(NOW);
    expect(new Date(today).toISOString()).toBe("2026-11-17T23:00:00.000Z"); // minuit Paris (UTC+1 en novembre)
    const hier = resolvePeriod("yesterday", undefined, undefined, NOW);
    expect(hier).toMatchObject({ from: today - DAY, to: today });
    expect(resolvePeriod("7d", undefined, undefined, NOW).from).toBe(today - 6 * DAY);
    // 20/10 à minuit Paris (l'heure d'été s'est terminée le 25/10 : 29 jours calendaires ≠ 29 × 24 h).
    expect(new Date(resolvePeriod("30d", undefined, undefined, NOW).from).toISOString()).toBe("2026-10-19T22:00:00.000Z");
    const c = resolvePeriod("custom", "2026-11-01", "2026-11-03", NOW);
    expect(c).toMatchObject({ preset: "custom" });
    expect(c.to - c.from).toBe(3 * DAY);
    // Dates invalides : retombe sur aujourd'hui, sans planter.
    expect(resolvePeriod("custom", "n'importe quoi", "", NOW).preset).toBe("today");
  });
});

describe("Analyse & Suggestions : uniquement des données réelles", () => {
  it("sans aucune donnée : aucun chiffre, aucune suggestion, aucune tendance inventée", () => {
    const core = testCore();
    const a = analyze(core, resolvePeriod("30d", undefined, undefined, NOW), NOW);
    expect(a.clientsActifs).toBe(0);
    expect(a.suggestions).toEqual([]);
    expect(a.tendances).toEqual([]);
    expect(a.services).toEqual([]);
    core.close();
  });

  it("compte des clients DISTINCTS (pas des messages) et garde les conversations justificatives", () => {
    const core = testCore();
    const a1 = client(core, 1, "Je voudrais créer une LLC");
    client(core, 2, "info sur la LLC Wyoming svp");
    client(core, 3, "Combien coûte une LLC ?");
    core.messages.insert(a1, "user", "et la LLC permet de vendre sur Shopify ?", null, NOW - 2 * H);
    client(core, 4, "je cherche une formation vinted");
    const a = analyze(core, resolvePeriod("today", undefined, undefined, NOW), NOW);
    const llc = a.services.find((s) => s.label === "LLC américaine")!;
    expect(llc.nbClients).toBe(3);
    expect(llc.nbMessages).toBe(4);
    expect(llc.exemples.length).toBe(3);
    expect(llc.exemples[0]?.waId).toMatch(/^3360000/);
    expect(a.formations.find((f) => f.label === "Vinted")?.nbClients).toBe(1);
    // Suggestion fondée sur le vrai nombre de clients ; Vinted (1 seul client) n'en génère pas.
    const sug = a.suggestions.find((s) => s.titre.includes("LLC américaine"))!;
    expect(sug.nbClients).toBe(3);
    expect(sug.texte).toContain("3 clients");
    expect(a.suggestions.some((s) => s.titre.includes("Vinted"))).toBe(false);
    core.close();
  });

  it("respecte la période : hier ≠ aujourd'hui", () => {
    const core = testCore();
    const today = startOfDay(NOW);
    client(core, 1, "info LLC", today + H);
    client(core, 2, "info LLC", today - 5 * H);
    client(core, 3, "info LLC", today - 3 * DAY);
    expect(analyze(core, resolvePeriod("today", undefined, undefined, NOW), NOW).services[0]?.nbClients).toBe(1);
    expect(analyze(core, resolvePeriod("yesterday", undefined, undefined, NOW), NOW).services[0]?.nbClients).toBe(1);
    expect(analyze(core, resolvePeriod("7d", undefined, undefined, NOW), NOW).services[0]?.nbClients).toBe(3);
    core.close();
  });

  it("n'identifie des objections que si les clients les ont exprimées", () => {
    const core = testCore();
    client(core, 1, "c'est trop cher pour moi");
    client(core, 2, "vous pouvez faire une réduction ?");
    client(core, 3, "bonjour je veux une LLC");
    const a = analyze(core, resolvePeriod("today", undefined, undefined, NOW), NOW);
    expect(a.objections.find((o) => o.id === "objection:prix")?.nbClients).toBe(2);
    expect(a.objections.find((o) => o.id === "objection:confiance")).toBeUndefined();
    expect(a.suggestions.some((s) => s.titre.includes("Objection fréquente") && s.texte.includes("Aucun tarif n'est modifié automatiquement"))).toBe(true);
    core.close();
  });

  it("détecte les offres à fort intérêt mais peu de ventes, à partir des vraies fiches", () => {
    const core = testCore();
    for (let i = 1; i <= 4; i++) {
      const wa = client(core, i, "je veux une LLC");
      core.leads.insert(wa, { offre: "LLC Wyoming", besoin: "x", budget: "", delai: "", score: 4 });
    }
    const id = (core.sqlite.prepare("SELECT MIN(id) id FROM leads").get() as { id: number }).id;
    core.sqlite.prepare("UPDATE leads SET ts = ?").run(NOW - H);
    setLeadStatusHuman(core, id, "perdu");
    const a = analyze(core, resolvePeriod("today", undefined, undefined, NOW), NOW);
    expect(a.interetSansVente).toEqual([{ offre: "LLC Wyoming", fiches: 4, devis: 0, gagnees: 0, perdues: 1 }]);
    expect(a.suggestions.some((s) => s.categorie === "conversion")).toBe(true);
    core.close();
  });

  it("repère les demandes récurrentes restées sans réponse", () => {
    const core = testCore();
    for (let i = 1; i <= 2; i++) {
      const wa = client(core, i, "Vous vendez des drones DJI ?");
      core.sqlite.prepare(`INSERT INTO questions (wa_id, texte, normalise, categorie, repondue, created_at) VALUES (?, ?, ?, 'Autre', 0, ?)`).run(wa, "Vous vendez des drones DJI ?", "drones dji", NOW - H);
    }
    const a = analyze(core, resolvePeriod("today", undefined, undefined, NOW), NOW);
    expect(a.sansOffre[0]).toMatchObject({ label: "Drones DJI", nbClients: 2 });
    expect(a.suggestions.some((s) => s.categorie === "offre" && s.nbClients === 2)).toBe(true);
    core.close();
  });

  it("tendance : « nouveau » seulement si la période précédente était vide, et à partir de 3 clients", () => {
    const core = testCore();
    for (let i = 1; i <= 3; i++) client(core, i, "je cherche un drone dji", NOW - H);
    const a = analyze(core, resolvePeriod("today", undefined, undefined, NOW), NOW);
    expect(a.tendances[0]).toMatchObject({ label: "Drones DJI", evolution: "nouveau" });
    for (let i = 4; i <= 6; i++) client(core, i, "drone dji prix", NOW - DAY - H);
    const b = analyze(core, resolvePeriod("today", undefined, undefined, NOW), NOW);
    expect(b.tendances.find((t) => t.label === "Drones DJI")).toBeUndefined();
    core.close();
  });

  it("le prompt IA ne contient que des chiffres réels, aucun identifiant de client, et interdit les modifications de prix", () => {
    const core = testCore();
    for (let i = 1; i <= 3; i++) client(core, i, `je veux une LLC contact 3360000${i}0000`);
    const a = analyze(core, resolvePeriod("today", undefined, undefined, NOW), NOW);
    const p = aiIdeasPrompt(a);
    expect(p.user).toContain("LLC américaine : 3 client(s)");
    expect(p.user).not.toMatch(/\d{9,}/);
    expect(p.system).toContain("n'invente AUCUN chiffre");
    expect(p.system).toContain("sans validation humaine");
    expect(aiIdeasPrompt(analyze(core, resolvePeriod("yesterday", undefined, undefined, NOW), NOW)).user).toBe("Aucune donnée sur la période.");
    core.close();
  });
});
