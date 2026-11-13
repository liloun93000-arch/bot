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

describe("validation des rendez-vous", () => {
  it("approuver garde le créneau, refuser le libère ; l'alerte passe en traitée", async () => {
    const { book, decideBooking, availability, approvalMessage, getBooking } = await import("../../dashboard/src/lib/bookings");
    const core = testCore();
    const now = Date.parse("2026-11-14T10:00:00Z");
    const r1 = book(core, { type: "15min", date: "2026-11-15", heure: "20:00", nom: "Karim", numero: "0612345678", sujet: "" }, now);
    const r2 = book(core, { type: "1h", date: "2026-11-15", heure: "21:00", nom: "Lina", numero: "0611111111", sujet: "" }, now);
    if (!r1.ok || !r2.ok) throw new Error("book");
    decideBooking(core, r1.id, "approuve");
    decideBooking(core, r2.id, "refuse");
    const free = availability(core, now)["15min"]["2026-11-15"]!;
    expect(free).not.toContain("20:00");
    expect(free).toContain("21:00");
    expect(core.alerts.open()).toHaveLength(0);
    expect(approvalMessage(getBooking(core, r1.id)!, "+33 7 78 78 37 01")).toContain("15/11/2026 à 20:00");
  });
});
