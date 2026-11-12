import { expect, it } from "vitest";
import { ajouterEcriture, ecritures, supprimerEcriture, totaux } from "../../dashboard/src/lib/compta";
import { testCore } from "./helpers";
it("compta : ventes, dépenses, période, suppression", () => {
  const core = testCore();
  const a = ajouterEcriture(core, { sens: "entree", montantCents: 60000, categorie: "Formation", libelle: "", client: "Karim", moyen: "Virement", dateTs: 1000 });
  ajouterEcriture(core, { sens: "sortie", montantCents: 2500, categorie: "Achat compte Snapchat", libelle: "", client: "", moyen: "Crypto", dateTs: 2000 });
  ajouterEcriture(core, { sens: "sortie", montantCents: 500, categorie: "Hébergement site", libelle: "", client: "Railway", moyen: "Carte", dateTs: 9000 });
  const t = totaux(ecritures(core, 0, 5000));
  expect(t.entrees).toBe(60000);
  expect(t.sorties).toBe(2500);
  supprimerEcriture(core, a);
  expect(totaux(ecritures(core, 0, 10000)).entrees).toBe(0);
});
