import { expect, it } from "vitest";
import { kimiFlows, saveKimiSnap } from "@arbi/core";
import { testCore } from "./helpers";
it("historique Kimi : aujourd'hui 6,44 + suite, mois = total", () => {
  const core = testCore();
  saveKimiSnap(core, { ts: Date.parse("2026-10-31T23:00:00Z"), available: 45, voucher: 0, cash: 0 });
  saveKimiSnap(core, { ts: Date.parse("2026-11-11T22:59:59Z"), available: 27.56952, voucher: 0, cash: 0 });
  saveKimiSnap(core, { ts: Date.parse("2026-11-12T06:11:00Z"), available: 21.12488, voucher: 0, cash: 0 });
  saveKimiSnap(core, { ts: Date.parse("2026-11-12T06:20:00Z"), available: 21.0, voucher: 0, cash: 0 });
  const now = Date.parse("2026-11-12T06:30:00Z");
  expect(kimiFlows(core, Date.parse("2026-11-11T23:00:00Z"), now).conso).toBeCloseTo(6.56952, 5);
  expect(kimiFlows(core, Date.parse("2026-10-31T23:00:00Z"), now).conso).toBeCloseTo(24, 5);
});
