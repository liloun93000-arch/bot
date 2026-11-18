import { describe, expect, it } from "vitest";
import { recordStatuses } from "../src/server";
import { testCore } from "./helpers";

describe("accusés WhatsApp (coches)", () => {
  it("n'affiche jamais « lu » sans événement read de Meta", () => {
    const core = testCore();
    recordStatuses(core, [{ id: "wamid.A", status: "sent", timestamp: "1700000000" }]);
    recordStatuses(core, [{ id: "wamid.A", status: "delivered", timestamp: "1700000005" }]);
    const info = core.delivery.get("wamid.A");
    expect(info?.status).toBe("delivered");
    expect(info?.readAt).toBeNull();
  });

  it("passe à lu avec l'heure de lecture fournie par Meta", () => {
    const core = testCore();
    recordStatuses(core, [
      { id: "wamid.B", status: "sent", timestamp: "1700000000" },
      { id: "wamid.B", status: "delivered", timestamp: "1700000005" },
      { id: "wamid.B", status: "read", timestamp: "1700000060" },
    ]);
    const info = core.delivery.get("wamid.B");
    expect(info?.status).toBe("read");
    expect(info?.readAt).toBe(1700000060 * 1000);
    expect(info?.sentAt).toBe(1700000000 * 1000);
  });

  it("ne régresse jamais quand les événements arrivent dans le désordre", () => {
    const core = testCore();
    recordStatuses(core, [
      { id: "wamid.C", status: "read", timestamp: "1700000060" },
      { id: "wamid.C", status: "delivered", timestamp: "1700000005" },
      { id: "wamid.C", status: "sent", timestamp: "1700000000" },
    ]);
    const info = core.delivery.get("wamid.C");
    expect(info?.status).toBe("read");
    expect(info?.deliveredAt).toBe(1700000005 * 1000);
    expect(info?.sentAt).toBe(1700000000 * 1000);
  });

  it("signale un échec avec son motif, mais n'annule pas un message déjà délivré", () => {
    const core = testCore();
    recordStatuses(core, [
      { id: "wamid.D", status: "failed", timestamp: "1700000000", errors: [{ code: 131047, message: "Re-engagement message" }] },
    ]);
    const echec = core.delivery.get("wamid.D");
    expect(echec?.status).toBe("failed");
    expect(echec?.errorCode).toBe(131047);

    recordStatuses(core, [
      { id: "wamid.E", status: "delivered", timestamp: "1700000000" },
      { id: "wamid.E", status: "failed", timestamp: "1700000001" },
    ]);
    expect(core.delivery.get("wamid.E")?.status).toBe("delivered");
  });

  it("ignore les statuts inconnus et les événements sans identifiant", () => {
    const core = testCore();
    const n = recordStatuses(core, [
      { id: "wamid.F", status: "deleted", timestamp: "1700000000" },
      { status: "read", timestamp: "1700000000" },
    ]);
    expect(n).toBe(0);
    expect(core.delivery.get("wamid.F")).toBeUndefined();
  });

  it("enregistre l'accusé même si le message n'est pas encore en base, puis le retrouve par wamid", () => {
    const core = testCore();
    recordStatuses(core, [{ id: "wamid.G", status: "sent", timestamp: "1700000000", recipient_id: "33612345678" }]);
    core.messages.insert("33612345678", "assistant", "Salut !", "wamid.G");
    const map = core.delivery.many(["wamid.G", "wamid.inconnu"]);
    expect(map.get("wamid.G")?.status).toBe("sent");
    expect(map.has("wamid.inconnu")).toBe(false);
  });
});
