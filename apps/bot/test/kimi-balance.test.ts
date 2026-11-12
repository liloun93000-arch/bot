import { describe, expect, it } from "vitest";
import { kimiFlows, lastKimiSnap, moonshotOrigin, saveKimiSnap } from "@arbi/core";
import { testCore } from "./helpers";

describe("solde Kimi réel", () => {
  it("conso = baisses du solde, recharge = hausses", () => {
    const core = testCore();
    const s = (ts: number, available: number) => saveKimiSnap(core, { ts, available, voucher: 0, cash: available });
    s(1000, 21.12);
    s(2000, 20.5);
    s(3000, 40.5); // recharge de 20
    s(4000, 39.9);
    const f = kimiFlows(core, 1000, 5000);
    expect(f.conso).toBeCloseTo(0.62 + 0.6, 6);
    expect(f.recharges).toBeCloseTo(20, 6);
    expect(f.couvert).toBe(true);
    expect(kimiFlows(core, 500, 5000).couvert).toBe(false);
    expect(kimiFlows(core, 2500, 5000).conso).toBeCloseTo(0.6, 6);
    expect(lastKimiSnap(core)?.available).toBe(39.9);
    expect(moonshotOrigin("https://api.moonshot.ai/anthropic")).toBe("https://api.moonshot.ai");
  });
});
