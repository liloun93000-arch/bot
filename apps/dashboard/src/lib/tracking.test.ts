import { createCore } from "@arbi/core";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clickSeries, listSources, recordClick } from "./tracking";

const DAY = 86_400_000;
describe("clickSeries", () => {
  it("compte les vrais clics par jour, par source, et 0 sinon ; total = somme des tranches", () => {
    const core = createCore({ dbPath: join(mkdtempSync(join(tmpdir(), "aj-")), "t.db") } as never);
    const [snap, tg] = listSources(core);
    const now = Date.UTC(2026, 10, 19, 12);
    recordClick(core, snap!.id, now);
    recordClick(core, snap!.id, now - DAY);
    recordClick(core, snap!.id, now - DAY + 1000);
    recordClick(core, tg!.id, now - 2 * DAY);
    const from = now - 6 * DAY;
    const s = clickSeries(core, snap!.id, from, now + 1);
    expect(s.reduce((a, x) => a + x.pages, 0)).toBe(3);
    expect(s.at(-1)?.pages).toBe(1);
    expect(s.at(-2)?.pages).toBe(2);
    expect(clickSeries(core, null, from, now + 1).reduce((a, x) => a + x.pages, 0)).toBe(4);
    const m = clickSeries(core, null, now - 70 * DAY, now + 1, "mois");
    expect(m.reduce((a, x) => a + x.pages, 0)).toBe(4);
    expect(m.length).toBeGreaterThanOrEqual(3);
    core.close();
  });
});
