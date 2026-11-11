import { describe, expect, it } from "vitest";
import { isRealQuestion } from "@arbi/core";
import { parisMidnight, parsePeriod } from "../../dashboard/src/lib/period";
import { BOT_UA_RE, clicksBySource, ensureTracking, listSources, recordClick, sourceBySlug } from "../../dashboard/src/lib/tracking";
import { testCore } from "./helpers";

describe("Périodes du tableau de bord (heure de Paris)", () => {
  const now = Date.UTC(2026, 10, 12, 10, 0, 0); // 12/11/2026 11:00 Paris
  it("aujourd'hui, hier, 7 j, 30 j", () => {
    expect(parsePeriod({ periode: "aujourdhui" }, now).from).toBe(Date.UTC(2026, 10, 11, 23, 0, 0));
    const h = parsePeriod({ periode: "hier" }, now);
    expect([h.from, h.to]).toEqual([Date.UTC(2026, 10, 10, 23, 0, 0), Date.UTC(2026, 10, 11, 23, 0, 0)]);
    expect(parsePeriod({ periode: "7j" }, now).from).toBe(Date.UTC(2026, 10, 5, 23, 0, 0));
    expect(parsePeriod({}, now).key).toBe("30j");
  });
  it("dates personnalisées (inversées corrigées), jour de fin inclus", () => {
    const p = parsePeriod({ periode: "perso", du: "2026-11-03", au: "2026-11-01" }, now);
    expect(p.from).toBe(parisMidnight("2026-11-01"));
    expect(p.to).toBe(parisMidnight("2026-11-04"));
    expect(p.label).toBe("Du 01/11/2026 au 03/11/2026");
  });
});

describe("Liens de suivi : clics par source, jamais de source inventée", () => {
  it("4 sources par défaut, clics comptés par source et par période", () => {
    const core = testCore();
    ensureTracking(core);
    expect(listSources(core).map((s) => s.slug)).toEqual(["snapchat", "telegram", "linktree", "site"]);
    const snap = sourceBySlug(core, "snapchat")!;
    const link = sourceBySlug(core, "linktree")!;
    recordClick(core, snap.id, 1000);
    recordClick(core, snap.id, 2000);
    recordClick(core, link.id, 5000);
    const c = clicksBySource(core, 0, 3000);
    expect(c.get(snap.id)).toBe(2);
    expect(c.get(link.id)).toBeUndefined();
    // aucune colonne « source » côté contacts : on ne rattache jamais un clic à un client
    const cols = core.sqlite.prepare("PRAGMA table_info(contacts)").all() as Array<{ name: string }>;
    expect(cols.some((x) => /source|origine/.test(x.name))).toBe(false);
    core.close();
  });
  it("les aperçus de liens (robots) ne sont pas des clics", () => {
    for (const ua of ["TelegramBot (like TwitterBot)", "facebookexternalhit/1.1", "WhatsApp/2.23", "Snapchat preview bot"]) expect(BOT_UA_RE.test(ua)).toBe(true);
    expect(BOT_UA_RE.test("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari")).toBe(false);
  });
});

describe("Français réel : formules de conversation ≠ demandes", () => {
  it("hamdoulilah et variantes", () => {
    for (const t of ["Al Hamdûlilah et toi", "HMLD et toi", "HMDL", "hmdl et toi", "alhamdulillah et toi", "hamdoullah tranquille", "HMLD ça va", "Hamdoulilah", "labas et toi ?", "cv et toi"]) {
      expect(isRealQuestion(t), t).toBe(false);
    }
    expect(isRealQuestion("hmdl, et le prix du Mavic ?")).toBe(true);
    expect(isRealQuestion("ça va être livré quand ?")).toBe(true);
  });
});
