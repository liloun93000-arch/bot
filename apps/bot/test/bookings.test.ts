import { describe, expect, it } from "vitest";
import { availability, book, bookableDays } from "../../dashboard/src/lib/bookings";
import { testCore } from "./helpers";

const NOW = Date.UTC(2026, 10, 12, 10, 0, 0); // 12/11 11:00 Paris

describe("Réservation d'appel", () => {
  it("à partir du lendemain, 14 jours, 20 h – minuit", () => {
    const days = bookableDays(NOW);
    expect(days[0]).toBe("2026-11-13");
    expect(days).toHaveLength(14);
    const core = testCore();
    const a = availability(core, NOW);
    expect(a["15min"]["2026-11-13"]).toEqual(["20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"]);
    expect(a["1h"]["2026-11-13"]).not.toContain("23:30"); // finirait après minuit
    core.close();
  });

  it("crée une alerte Jacob, refuse le doublon et le chevauchement", () => {
    const core = testCore();
    const r = book(core, { type: "1h", date: "2026-11-13", heure: "21:00", nom: "Karim", numero: "06 12 34 56 78", sujet: "LLC" }, NOW);
    expect(r.ok).toBe(true);
    expect(core.alerts.open()[0]?.waId).toBe("33612345678");
    expect(core.alerts.open()[0]?.motif).toContain("13/11/2026 à 21:00");
    // même créneau → refusé ; créneau 21:30 (pris par l'appel d'1 h) → refusé
    expect(book(core, { type: "15min", date: "2026-11-13", heure: "21:00", nom: "A", numero: "0611111111", sujet: "" }, NOW).ok).toBe(false);
    expect(book(core, { type: "15min", date: "2026-11-13", heure: "21:30", nom: "A", numero: "0611111111", sujet: "" }, NOW).ok).toBe(false);
    expect(core.alerts.countOpen()).toBe(1);
    const a = availability(core, NOW);
    expect(a["15min"]["2026-11-13"]).not.toContain("21:00");
    expect(a["1h"]["2026-11-13"]).not.toContain("20:30");
    // aujourd'hui → refusé
    expect(book(core, { type: "15min", date: "2026-11-12", heure: "20:00", nom: "A", numero: "0611111111", sujet: "" }, NOW).ok).toBe(false);
    core.close();
  });
});
