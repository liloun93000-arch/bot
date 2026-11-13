import { expect, it } from "vitest";
import { recordVisit, visitStats, visitorId, BOT_VISIT_RE } from "../../dashboard/src/lib/visits";
import { testCore } from "./helpers";
it("visites : visiteurs uniques, pages vues, par heure", () => {
  const core = testCore();
  const t0 = Date.parse("2026-11-13T23:00:00Z"); // minuit Paris le 14/11
  const a = visitorId("1.1.1.1", "iPhone", t0), b = visitorId("2.2.2.2", "Android", t0);
  recordVisit(core, { path: "/", vid: a, ts: t0 + 3_600_000 });
  recordVisit(core, { path: "/formations", vid: a, ts: t0 + 3_700_000 });
  recordVisit(core, { path: "/", vid: b, ts: t0 + 7_300_000 });
  const s = visitStats(core, t0, t0 + 86_400_000, t0 + 86_400_000);
  expect(s.visiteurs).toBe(2);
  expect(s.pages).toBe(3);
  expect(s.tranches).toHaveLength(24);
  expect(s.tranches[1]!.pages).toBe(2);
  expect(BOT_VISIT_RE.test("WhatsApp/2.23")).toBe(true);
});
