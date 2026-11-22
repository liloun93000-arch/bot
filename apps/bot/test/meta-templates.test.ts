import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureRelanceTemplate, resolveWabaId } from "@arbi/core";

type Route = (url: string, init?: RequestInit) => { status?: number; json: unknown };
function mockFetch(route: Route) {
  const calls: Array<{ url: string; method: string }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET" });
    const r = route(url, init);
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.json } as Response;
  });
  return calls;
}
afterEach(() => vi.unstubAllGlobals());
const env = { token: "T", phoneNumberId: "PN1", apiBase: "https://g.test/v21.0" };

describe("Templates Meta : compte retrouvé sans WABA_ID, template soumis seulement s'il manque", () => {
  it("utilise WABA_ID s'il est fourni, sans appeler Meta", async () => {
    const calls = mockFetch(() => ({ json: {} }));
    expect(await resolveWabaId({ ...env, wabaId: "W9" })).toMatchObject({ wabaId: "W9" });
    expect(calls).toHaveLength(0);
  });

  it("sans WABA_ID : le découvre via le jeton, et choisit le compte qui possède le numéro", async () => {
    mockFetch((url) => {
      if (url.includes("/debug_token")) return { json: { data: { granular_scopes: [{ scope: "whatsapp_business_management", target_ids: ["A", "B"] }, { scope: "business_management", target_ids: ["Z"] }] } } };
      if (url.includes("/A/phone_numbers")) return { json: { data: [{ id: "OTHER" }] } };
      if (url.includes("/B/phone_numbers")) return { json: { data: [{ id: "PN1" }] } };
      return { status: 404, json: {} };
    });
    expect(await resolveWabaId(env)).toMatchObject({ wabaId: "B" });
  });

  it("template absent : il est soumis à Meta (POST), puis déclaré « soumis »", async () => {
    const calls = mockFetch((url, init) => {
      if (url.includes("/debug_token")) return { json: { data: { granular_scopes: [{ scope: "whatsapp_business_management", target_ids: ["W1"] }] } } };
      if (init?.method === "POST") return { json: { status: "PENDING" } };
      return { json: { data: [{ name: "alerte_admin", language: "fr", status: "APPROVED" }] } };
    });
    const out = await ensureRelanceTemplate(env);
    expect(out.action).toBe("soumis");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(out.templates.map((t) => t.name)).toContain("alerte_admin");
  });

  it("template déjà approuvé ou en attente : aucune nouvelle soumission", async () => {
    for (const [status, action] of [["APPROVED", "deja_approuve"], ["PENDING", "en_attente"]] as const) {
      const calls = mockFetch(() => ({ json: { data: [{ name: "relance_client", language: "fr", status }] } }));
      const out = await ensureRelanceTemplate({ ...env, wabaId: "W1" });
      expect(out.action).toBe(action);
      expect(calls.some((c) => c.method === "POST")).toBe(false);
    }
  });

  it("template rejeté chez Meta : une nouvelle soumission est tentée, refus de Meta rapporté tel quel", async () => {
    mockFetch((_u, init) =>
      init?.method === "POST"
        ? { status: 400, json: { error: { error_user_msg: "Contenu refusé" } } }
        : { json: { data: [{ name: "relance_client", language: "fr", status: "REJECTED" }] } },
    );
    const out = await ensureRelanceTemplate({ ...env, wabaId: "W1" });
    expect(out.action).toBe("refuse_par_meta");
    expect(out.detail).toContain("Contenu refusé");
  });

  it("jeton sans compte WhatsApp Business : erreur explicite, aucune soumission", async () => {
    const calls = mockFetch(() => ({ status: 400, json: {} }));
    const out = await ensureRelanceTemplate(env);
    expect(out.action).toBe("sans_compte");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});
