import { describe, expect, it } from "vitest";
import { recordUsage } from "@arbi/core";
import { testCore } from "./helpers";
import { saisirSolde, suiviConso, PRIX_DEFAUT } from "../../dashboard/src/lib/api-balance";

describe("suivi conso Kimi", () => {
  it("solde saisi moins consommation depuis la saisie", () => {
    const core = testCore();
    const t0 = Date.parse("2026-11-12T06:00:00Z");
    recordUsage(core, { model: "kimi", inputTokens: 1_000_000, outputTokens: 0, costCentimes: 0, billedCentimes: 0 }, t0 - 1000);
    saisirSolde(core, { soldeUsd: 21.12488, prixEntree: PRIX_DEFAUT.entree, prixSortie: PRIX_DEFAUT.sortie, createdAt: t0 });
    recordUsage(core, { model: "kimi", inputTokens: 1_000_000, outputTokens: 500_000, costCentimes: 0, billedCentimes: 0 }, t0 + 1000);
    const s = suiviConso(core, t0 + 2000);
    expect(s.depuisSaisie.usd).toBeCloseTo(0.95 + 2, 5);
    expect(s.restantUsd).toBeCloseTo(21.12488 - 2.95, 5);
    expect(s.jours[0]!.appels).toBe(2);
  });
});
