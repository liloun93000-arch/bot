import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { NIVEAU4_MESSAGE, NIVEAU4_MESSAGE_V8, isRealQuestion, type Core, type Logger } from "@arbi/core";

/**
 * Les 4 catalogues PDF China Access (V9.1) sont installés automatiquement dans
 * « Fichiers du bot » : aucun bouton à presser. Une clé déjà présente n'est pas
 * réécrite (Jacob garde la main sur la description / l'activation).
 */
export const CHINA_ACCESS_CATALOGUES = [
  { cle: "catalogue_apple", fichier: "CATALOGUE_APPLE_TECH_CHINA_ACCESS.pdf", nom: "Catalogue Apple & Tech — China Access", description: "Grille Apple (iPhone, iPad, Mac…), consoles et reconditionné. À envoyer quand le client veut toute la grille Apple ou le catalogue Apple." },
  { cle: "catalogue_vehicules", fichier: "CATALOGUE_VEHICULES_CHINA_ACCESS.pdf", nom: "Catalogue Véhicules électriques — China Access", description: "31 véhicules électriques (Surron, Talaria…), deux prix par modèle. À envoyer quand le client veut le catalogue motos / véhicules." },
  { cle: "catalogue_drones", fichier: "CATALOGUE_DRONES_CHINA_ACCESS.pdf", nom: "Catalogue Drones DJI — China Access", description: "38 références DJI. À envoyer quand le client demande le catalogue drones." },
  { cle: "catalogue_volants", fichier: "CATALOGUE_VOLANTS_CHINA_ACCESS.pdf", nom: "Catalogue Volants — China Access", description: "46 familles de volants sur mesure (cuir, carbone, LED) par marque. À envoyer quand le client demande le catalogue volants." },
] as const;

const NEW_KEYS = new Set<string>(CHINA_ACCESS_CATALOGUES.map((c) => c.cle));

export async function installCatalogues(core: Core, seedDir: string, mediaDir: string, log: Logger): Promise<void> {
  await mkdir(mediaDir, { recursive: true }).catch(() => undefined);
  for (const c of CHINA_ACCESS_CATALOGUES) {
    if (core.botFiles.byCle(c.cle)) continue;
    const src = join(seedDir, c.fichier);
    try {
      const info = await stat(src);
      await copyFile(src, join(mediaDir, c.fichier));
      core.botFiles.create({ cle: c.cle, nom: c.nom, description: c.description, fichier: c.fichier, mime: "application/pdf", kind: "document", taille: info.size });
      log.info({ cle: c.cle }, "catalogue_pdf_installed");
    } catch (err) {
      log.error({ err: String(err), cle: c.cle }, "catalogue_pdf_install_failed");
    }
  }
  // Message niveau 4 : l'ancien texte (« je n'ai pas les connaissances… écris à Jacob ») est remplacé
  // par le message de secours paiement, sauf s'il a été personnalisé dans le tableau de bord.
  if (String(core.settings.get("niveau4_message")) === NIVEAU4_MESSAGE_V8) core.settings.set("niveau4_message", NIVEAU4_MESSAGE);

  // Une seule fois : les anciens PDF « ARBI JACOB » (drones, volants, motos) sont périmés → désactivés (pas supprimés).
  if (core.sends.claim("seed:old-catalogues-off:v9.1")) {
    for (const f of core.botFiles.list()) {
      if (NEW_KEYS.has(f.cle) || f.actif !== 1) continue;
      if (/drone|volant|moto|surron|talaria|v[ée]hicule/i.test(`${f.cle} ${f.nom}`)) {
        core.botFiles.toggle(f.id);
        log.info({ cle: f.cle }, "old_catalogue_disabled");
      }
    }
  }
}

/**
 * Script China Access V9.1 : remplace ENTIÈREMENT le catalogue en place (notice : « on ne fusionne
 * pas, on écrase »), une seule fois, et seulement si le fichier livré est complet (« FIN DU SCRIPT
 * V9.1 » tout en bas). L'ancienne version reste dans l'historique des versions du back-office.
 */
export const SCRIPT_END_MARKER = "FIN DU SCRIPT V9.1";

export async function installScript(core: Core, path: string, log: Logger): Promise<boolean> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (err) {
    log.error({ err: String(err), path }, "script_v91_read_failed");
    return false;
  }
  if (!content.trimEnd().split("\n").slice(-3).join("\n").includes(SCRIPT_END_MARKER)) {
    log.error({ path }, "script_v91_incomplete");
    return false;
  }
  if (core.catalogue.current().contenu === content) return false;
  if (!core.sends.claim("seed:catalogue:v9.1")) return false; // déjà installé une fois : Jacob garde la main ensuite
  core.catalogue.save(content, "Script China Access V9.1 — remplace entièrement l'ancien catalogue");
  log.info({ chars: content.length }, "script_v91_installed");
  return true;
}

/**
 * Nettoyage : alertes / demandes Jacob ouvertes à cause d'une simple formule de conversation
 * (« salut ça va », « ça va et toi », « hmdl »…). Elles sont closes, le client n'est plus « en alerte »
 * et ses questions de ce type sortent de « sans réponse ». Idempotent (rejoué à chaque démarrage).
 */
export function cleanupSmallTalkAlerts(core: Core, log: Logger): string[] {
  // Correction ponctuelle : l'alerte 22 de cette vague (« Les dernier ») était une vraie réponse
  // client fermée à tort par la 1re version du filtre → rouverte, une seule fois.
  if (core.sends.claim("fix:reopen-alert-les-dernier")) {
    core.sqlite.prepare(`UPDATE alerts SET statut = 'ouverte', treated_at = NULL WHERE statut <> 'ouverte' AND dernier_message = 'Les dernier'`).run();
    core.sqlite.prepare(`UPDATE contacts SET statut = 'alerte' WHERE wa_id IN (SELECT wa_id FROM alerts WHERE statut = 'ouverte' AND dernier_message = 'Les dernier')`).run();
  }
  const closed: string[] = [];
  for (const a of core.alerts.open()) {
    if (a.categorie === "Réservation d'appel") continue; // une réservation n'est jamais de la politesse
    // Ce que le client a VRAIMENT écrit : le motif (« Jacob doit reprendre la conversation : … »),
    // sinon le dernier message reçu avant l'alerte, sinon le texte enregistré dans l'alerte.
    const fromMotif = /^Jacob doit reprendre la conversation : (.*?)(?: — |$)/.exec(a.motif)?.[1] ?? "";
    const lastBefore = (
      core.sqlite
        .prepare(`SELECT contenu FROM messages WHERE wa_id = ? AND role = 'user' AND ts <= ? ORDER BY id DESC LIMIT 1`)
        .get(a.waId, a.createdAt + 60_000) as { contenu: string } | undefined
    )?.contenu.replace(/^\[[^\]]*\]\s*/, "");
    const txt = fromMotif || lastBefore || a.dernierMessage || "";
    log.info(`cleanup_check alerte ${a.id} : « ${txt.slice(0, 80)} » → ${isRealQuestion(txt) ? "vraie demande" : "politesse"}`);
    if (txt && !isRealQuestion(txt)) {
      core.alerts.markTreated(a.id);
      if (!core.alerts.hasOpenFor(a.waId)) core.contacts.setStatut(a.waId, "en_cours");
      closed.push(`alerte ${a.id} (+${a.waId}) « ${txt.slice(0, 60)} »`);
    }
  }
  for (const e of core.knowledge.escalations.open()) {
    if (!isRealQuestion(e.question)) {
      core.knowledge.escalations.cancel(e.id);
      closed.push(`demande ${e.id} (+${e.waId}) « ${e.question.slice(0, 60)} »`);
    }
  }
  for (const q of core.questions.unanswered(500)) {
    if (!isRealQuestion(q.texte)) core.sqlite.prepare(`UPDATE questions SET repondue = 1 WHERE id = ?`).run(q.id);
  }
  log.info(`cleanup_small_talk: ${closed.length} fermée(s)${closed.length ? " — " + closed.join(" | ") : ""}`);
  return closed;
}
