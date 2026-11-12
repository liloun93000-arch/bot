import type { Core } from "@arbi/core";

/** Compta simple : entrées (ventes) et sorties (achats, hébergement…) saisies à la main, en euros. */

export const CATS_ENTREE = ["Formation", "LLC / LTD", "Compte Snapchat", "Sourcing", "Graphisme & digital", "Appel 1 h", "Affiliation", "Autre vente"];
export const CATS_SORTIE = ["Achat compte Snapchat", "Hébergement site", "Recharge Kimi", "Publicité", "Fournisseur", "Abonnement / outil", "Autre dépense"];
export const MOYENS = ["Virement", "Crypto", "PayPal", "Carte", "Espèces", "Autre"];

export interface Ecriture {
  id: number;
  sens: "entree" | "sortie";
  montantCents: number;
  categorie: string;
  libelle: string;
  client: string;
  moyen: string;
  dateTs: number;
}

const ready = new WeakSet<object>();
function ensure(core: Core): void {
  if (ready.has(core)) return;
  core.sqlite
    .prepare(
      `CREATE TABLE IF NOT EXISTS compta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sens TEXT NOT NULL CHECK (sens IN ('entree','sortie')),
        montant_cents INTEGER NOT NULL,
        categorie TEXT NOT NULL,
        libelle TEXT NOT NULL DEFAULT '',
        client TEXT NOT NULL DEFAULT '',
        moyen TEXT NOT NULL DEFAULT '',
        date_ts INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    )
    .run();
  ready.add(core);
}

export function ajouterEcriture(core: Core, e: Omit<Ecriture, "id">): number {
  ensure(core);
  const r = core.sqlite
    .prepare(
      `INSERT INTO compta (sens, montant_cents, categorie, libelle, client, moyen, date_ts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(e.sens, e.montantCents, e.categorie, e.libelle, e.client, e.moyen, e.dateTs, Date.now()) as unknown as { lastInsertRowid: number | bigint };
  return Number(r.lastInsertRowid);
}

export function supprimerEcriture(core: Core, id: number): void {
  ensure(core);
  core.sqlite.prepare(`DELETE FROM compta WHERE id = ?`).run(id);
}

export function ecritures(core: Core, from: number, to: number): Ecriture[] {
  ensure(core);
  return (
    core.sqlite
      .prepare(
        `SELECT id, sens, montant_cents, categorie, libelle, client, moyen, date_ts FROM compta
         WHERE date_ts >= ? AND date_ts < ? ORDER BY date_ts DESC, id DESC`,
      )
      .all(from, to) as Array<{ id: number; sens: "entree" | "sortie"; montant_cents: number; categorie: string; libelle: string; client: string; moyen: string; date_ts: number }>
  ).map((r) => ({
    id: r.id,
    sens: r.sens,
    montantCents: r.montant_cents,
    categorie: r.categorie,
    libelle: r.libelle,
    client: r.client,
    moyen: r.moyen,
    dateTs: r.date_ts,
  }));
}

export function totaux(list: Ecriture[]): { entrees: number; sorties: number; parCat: Array<[string, "entree" | "sortie", number]> } {
  let entrees = 0;
  let sorties = 0;
  const m = new Map<string, number>();
  for (const e of list) {
    if (e.sens === "entree") entrees += e.montantCents;
    else sorties += e.montantCents;
    const k = `${e.sens}|${e.categorie}`;
    m.set(k, (m.get(k) ?? 0) + e.montantCents);
  }
  const parCat = [...m.entries()]
    .map(([k, v]) => {
      const [sens, cat] = k.split("|") as ["entree" | "sortie", string];
      return [cat, sens, v] as [string, "entree" | "sortie", number];
    })
    .sort((a, b) => b[2] - a[2]);
  return { entrees, sorties, parCat };
}
