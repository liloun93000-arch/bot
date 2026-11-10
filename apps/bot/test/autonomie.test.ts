import { describe, expect, it } from "vitest";
import { buildStaticPrompt } from "../src/prompt";

const CATALOGUE = "SCRIPT COMPLET — BOT CHINA ACCESS (extrait de test)";

function prompt(autonomie?: "autonome" | "equilibre" | "prudent"): string {
  return buildStaticPrompt(CATALOGUE, [], [], [], "", autonomie);
}

describe("autonomie du bot — script V9.1", () => {
  it("par défaut : l'alerte est une EXCEPTION, jamais par confort", () => {
    const p = prompt();
    expect(p).toContain("L'alerte est une EXCEPTION");
    expect(p).toContain("Jamais d'alerte par confort");
  });

  it("mode prudent : alerte au moindre doute, mais jamais pour un prix présent dans le script", () => {
    const p = prompt("prudent");
    expect(p).toContain("Autonomie : prudente");
    expect(p).toContain("moindre doute");
    expect(p).toContain("jamais pour un prix présent dans le script");
  });

  it("le script est en TÊTE du prompt (mise en cache) et fait foi", () => {
    const p = prompt();
    expect(p.startsWith(`<catalogue>\n${CATALOGUE}\n</catalogue>`)).toBe(true);
    expect(p).toContain("c'est le script qui gagne");
  });

  it("garde-fous quel que soit le niveau : prix du script uniquement, numéro limité à la section 11, alertes", () => {
    for (const niveau of ["autonome", "equilibre", "prudent"] as const) {
      const p = prompt(niveau);
      expect(p).toContain("Une question de prix ne mène JAMAIS à Jacob");
      expect(p).toContain("uniquement dans les deux cas de la section 11");
      expect(p).toContain("raise_alert");
      expect(p).not.toContain("t.me/");
    }
  });
});
