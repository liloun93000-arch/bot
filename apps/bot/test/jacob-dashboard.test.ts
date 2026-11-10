import { describe, expect, it } from "vitest";
import { jacobHistory, jacobPending, jacobPendingCount } from "../../dashboard/src/lib/jacob";
import { testCore } from "./helpers";

const C = "33612345678";

describe("Onglet Jacob (données du back-office)", () => {
  it("badge = questions inconnues + alertes, avec photo, puis passe à zéro après réponse", () => {
    const core = testCore();
    core.messages.insert(C, "user", "[Image] c'est quoi ce sac ?", "w1", Date.now(), { type: "image", file: "p1.jpg", mime: "image/jpeg" });
    const escId = core.knowledge.escalations.create({
      waId: C,
      question: "Vous avez ce sac en stock ?",
      mediaFile: "p1.jpg",
      mediaMime: "image/jpeg",
      contexte: "Photo d'un sac",
    });
    core.alerts.create({ waId: "33698765432", categorie: "Autre", intention: "", motif: "Réclamation", resume: "r", dernierMessage: "Colis cassé" });

    expect(jacobPendingCount(core)).toBe(2);
    const p = jacobPending(core);
    expect(p).toHaveLength(2);
    const q = p.find((r) => r.kind === "question")!;
    expect(q.question).toBe("Vous avez ce sac en stock ?");
    expect(q.statutLabel).toBe("En attente de Jacob");
    expect(q.mediaFile).toBe("p1.jpg");
    expect(q.contexte).toContain("sac");
    expect(p.find((r) => r.kind === "alerte")!.question).toBe("Colis cassé");
    core.alerts.create({ waId: C, categorie: "Autre", intention: "", motif: "Photo + doute", resume: "", dernierMessage: "regardez" });
    expect(jacobPending(core).find((r) => r.kind === "alerte" && r.waId === C)!.mediaFile).toBe("p1.jpg");
    core.alerts.markTreated(core.alerts.open().find((a) => a.waId === C)!.id);

    core.knowledge.escalations.resolve(escId, { reponseJacob: "Oui, 2 semaines", entryId: null });
    expect(jacobPendingCount(core)).toBe(1);
    const h = jacobHistory(core);
    expect(h[0]!.statutLabel).toBe("Résolu par Jacob");
    expect(h[0]!.reponse).toBe("Oui, 2 semaines");

    core.alerts.markTreated(p.find((r) => r.kind === "alerte")!.id);
    expect(jacobPendingCount(core)).toBe(0);
    expect(jacobPending(core)).toHaveLength(0);
  });

  it("carte Connaissances : compteur + ajout manuel", () => {
    const core = testCore();
    const before = core.knowledge.entries.count();
    core.knowledge.entries.add(
      { sujet: "Neverfull", intention: "dispo ?", reponse: "Sur commande, ~2 semaines", source: "admin" },
      "ajout manuel",
    );
    expect(core.knowledge.entries.count()).toBe(before + 1);
  });
});
