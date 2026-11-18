import { auditOpenAlerts, clearAuditedAlerts, isSubjectlessRequest } from "@arbi/core";
import { describe, expect, it } from "vitest";
import { analyzeInbound } from "../src/brain";
import { testCore } from "./helpers";

const WA = "33600000001";

describe("sujet inconnu : qualification au lieu d'alerte", () => {
  it("reconnaît une demande d'information sans sujet", () => {
    expect(isSubjectlessRequest("Salut, j'aimerais avoir des informations")).toBe(true);
    expect(isSubjectlessRequest("Bonjour, j'ai une question")).toBe(true);
    expect(isSubjectlessRequest("je veux créer une LLC")).toBe(false);
    expect(isSubjectlessRequest("c'est combien les casquettes ?")).toBe(false);
    expect(isSubjectlessRequest("")).toBe(false);
  });

  it("un client vague n'est JAMAIS routé vers une alerte, même après plusieurs tours", () => {
    const core = testCore();
    core.contacts.upsert(WA);
    const state = core.state.get(WA);
    let last = analyzeInbound(core, state, ["Salut, j'aimerais avoir des informations"], 2);
    expect(last.subjectUnknown).toBe(true);
    for (let i = 0; i < 6; i++) last = analyzeInbound(core, state, ["Salut, j'aimerais avoir des informations"], 2);
    expect(last.route).toBe("agent");
    expect(last.subjectUnknown).toBe(true);
    expect(core.alerts.open()).toHaveLength(0);
    core.close();
  });

  it("un client qui nomme son sujet n'est plus « sujet inconnu »", () => {
    const core = testCore();
    core.contacts.upsert(WA);
    const state = core.state.get(WA);
    const a = analyzeInbound(core, state, ["je voudrais créer une LLC"], 3);
    expect(a.subjectUnknown).toBe(false);
    core.close();
  });
});

function openAlert(core: ReturnType<typeof testCore>, waId: string, motif: string, resume: string) {
  core.contacts.upsert(waId);
  core.contacts.setStatut(waId, "alerte");
  return core.alerts.create({ waId, categorie: "Autre", intention: "", motif, resume, dernierMessage: "x" });
}

describe("audit des alertes existantes", () => {
  it("retire les fausses alertes, garde les vraies, conserve l'historique", () => {
    const core = testCore();

    // 1) Client vague, le bot indique lui-même « Blocage : aucun » → fausse alerte.
    core.messages.insert("33600000010", "user", "Salut, j'aimerais avoir des informations");
    core.messages.insert("33600000010", "assistant", "Bien sûr ! Tu cherches quoi ?");
    const fausse = openAlert(core, "33600000010", "5 échanges sans progression", "Client : inconnu\nBlocage : aucun\nÀ faire : qualifier");

    // 2) Réclamation → à garder.
    core.messages.insert("33600000011", "user", "J'ai un problème avec ma commande");
    const vraie = openAlert(core, "33600000011", "réclamation ou problème", "Blocage : colis non reçu");

    // 3) Vraie question toujours sans réponse → à garder, même avec « Blocage : aucun ».
    core.messages.insert("33600000012", "user", "Vous livrez en Belgique combien de temps ?");
    const attend = openAlert(core, "33600000012", "échanges sans progression", "Blocage : aucun");

    // 4) Question restée sans réponse, mais le bot a répondu depuis → déjà traitée.
    core.messages.insert("33600000013", "user", "Quels sont vos tarifs pour un logo ?");
    const traitee = openAlert(core, "33600000013", "question restée sans réponse du bot", "Blocage : prix inconnu");
    core.sqlite.prepare(`UPDATE alerts SET created_at = created_at - 10 WHERE id = ?`).run(traitee);
    core.messages.insert("33600000013", "assistant", "Un logo démarre à 50 €.");

    const verdicts = Object.fromEntries(auditOpenAlerts(core).map((i) => [i.id, i.verdict]));
    expect(verdicts[fausse]).toBe("fausse_alerte");
    expect(verdicts[vraie]).toBe("a_garder");
    expect(verdicts[attend]).toBe("a_garder");
    expect(verdicts[traitee]).toBe("deja_traitee");

    const before = core.alerts.countOpen();
    const { cleared } = clearAuditedAlerts(core);
    expect(cleared).toBe(2);
    expect(core.alerts.countOpen()).toBe(before - 2);
    // Les vraies alertes restent ouvertes.
    expect(core.alerts.hasOpenFor("33600000011")).toBe(true);
    expect(core.alerts.hasOpenFor("33600000012")).toBe(true);
    // Historique conservé avec la raison, client sorti du statut « alerte ».
    const retiree = core.alerts.get(fausse);
    expect(retiree?.statut).toBe("retiree");
    expect(retiree?.clotureNote).toContain("progression");
    expect(core.contacts.get("33600000010")?.statut).toBe("en_cours");
    expect(core.contacts.get("33600000011")?.statut).toBe("alerte");
    // Aucun message envoyé au client par l'audit.
    expect(core.messages.history("33600000010", 10)).toHaveLength(2);
    core.close();
  });
});
