import { createCore } from "@arbi/core";
import { describe, expect, it } from "vitest";
import { parsePeriod } from "./period";
import { recordVisit, visitStats } from "./visits";

const NOW = Date.UTC(2026, 10, 18, 14, 30); // 15:30 à Paris
const H = 3_600_000;

function seeded() {
  const core = createCore({ dbPath: ":memory:" });
  for (let i = 0; i < 60; i++) recordVisit(core, { path: i % 3 ? "/" : "/formations", vid: `v${i % 25}`, ts: NOW - i * 11 * H });
  recordVisit(core, { path: "/", vid: "maintenant", ts: NOW - 60_000 }); // dans l'heure en cours
  return core;
}

describe("statistiques de visites : graphique = compteurs", () => {
  for (const periode of ["aujourdhui", "hier", "7j", "30j"]) {
    it(`${periode} : la somme des tranches égale le total, jamais de visite perdue`, () => {
      const core = seeded();
      const p = parsePeriod({ periode }, NOW);
      const s = visitStats(core, p.from, p.to + 1, NOW);
      expect(s.tranches.reduce((a, t) => a + t.pages, 0)).toBe(s.pages);
      expect(s.pages).toBeGreaterThan(0);
      core.close();
    });
  }

  it("la visite de l'heure en cours apparaît dans le graphique d'aujourd'hui", () => {
    const core = seeded();
    const p = parsePeriod({ periode: "aujourdhui" }, NOW);
    const s = visitStats(core, p.from, p.to + 1, NOW);
    expect(s.tranches.at(-1)).toMatchObject({ label: "15h", pages: 2, visiteurs: 2 });
    core.close();
  });

  it("hier : exactement 24 tranches horaires, sans heure fantôme", () => {
    const core = seeded();
    const p = parsePeriod({ periode: "hier" }, NOW);
    expect(visitStats(core, p.from, p.to + 1, NOW).tranches).toHaveLength(24);
    core.close();
  });

  it("période personnalisée sur plusieurs jours, avec changement d'heure (25/10/2026)", () => {
    const core = createCore({ dbPath: ":memory:" });
    recordVisit(core, { path: "/", vid: "a", ts: Date.UTC(2026, 9, 24, 21, 0) }); // 24/10 23h Paris
    recordVisit(core, { path: "/", vid: "b", ts: Date.UTC(2026, 9, 25, 22, 30) }); // 25/10 23h30 Paris
    recordVisit(core, { path: "/", vid: "c", ts: Date.UTC(2026, 9, 26, 0, 10) }); // 26/10 01h10 Paris
    const p = parsePeriod({ periode: "perso", du: "2026-10-24", au: "2026-10-26" }, NOW);
    const s = visitStats(core, p.from, p.to + 1, NOW);
    expect(s.tranches.map((t) => [t.label, t.pages])).toEqual([["24/10", 1], ["25/10", 1], ["26/10", 1]]);
    expect(s.visiteurs).toBe(3);
    core.close();
  });
});
