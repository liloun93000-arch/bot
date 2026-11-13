import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { NIVEAU4_MESSAGE, NIVEAU4_MESSAGE_V8, isRealQuestion, type Core, type Logger } from "@arbi/core";

/**
 * Les 6 PDF China Access (V9.2) installés automatiquement dans « Fichiers du bot » : 4 catalogues + 2 kits
 * affiliés. À l'installation V9.2 (une seule fois), les anciennes fiches de ces clés sont remplacées par
 * les nouveaux fichiers, et tous les anciens PDF périmés (CATALOGUE_…, « ARBI JACOB ») sont désactivés.
 */
export const CHINA_ACCESS_CATALOGUES = [
  { cle: "catalogue_apple", fichier: "CA_APPLE_TECH_V92.pdf", nom: "Catalogue Apple & Tech — China Access", description: "Grille Apple, consoles et reconditionné (section 38). À envoyer si le client choisit le PDF plutôt que la réponse modèle par modèle." },
  { cle: "catalogue_vehicules", fichier: "CA_VEHICULES_V92.pdf", nom: "Catalogue Véhicules électriques — China Access", description: "31 véhicules électriques, deux prix par modèle (section 39). À envoyer si le client choisit le PDF." },
  { cle: "catalogue_drones", fichier: "CA_DRONES_V92.pdf", nom: "Catalogue Drones DJI — China Access", description: "Les références DJI par gamme (section 47). À envoyer si le client choisit le PDF." },
  { cle: "catalogue_volants", fichier: "CA_VOLANTS_V92.pdf", nom: "Catalogue Volants auto sport — China Access", description: "Les familles de volants par marque (section 46). À envoyer si le client choisit le PDF." },
  { cle: "kit_affilie", fichier: "CA_KIT_AFFILIE_V92.pdf", nom: "Kit affilié — China Access", description: "Pour un nouvel affilié : fonctionnement du programme et offres (section 64)." },
  { cle: "kit_vente", fichier: "CA_KIT_VENTE_V92.pdf", nom: "Kit de vente affilié — China Access", description: "Pour un affilié qui veut vendre : méthode TikTok, Snap et lives, messages types, objections (section 64)." },
] as const;

const NEW_KEYS = new Set<string>(CHINA_ACCESS_CATALOGUES.map((c) => c.cle));

export async function installCatalogues(core: Core, seedDir: string, mediaDir: string, log: Logger): Promise<void> {
  await mkdir(mediaDir, { recursive: true }).catch(() => undefined);
  // V9.2, une seule fois : les fiches existantes de ces clés pointent vers les anciens PDF → retirées pour être recréées,
  // et les autres anciens catalogues / kits périmés sont désactivés (pas supprimés).
  if (core.sends.claim("seed:catalogues:v9.2")) {
    for (const c of CHINA_ACCESS_CATALOGUES) {
      const old = core.botFiles.byCle(c.cle);
      if (old && old.fichier !== c.fichier) core.botFiles.remove(old.id);
    }
    for (const f of core.botFiles.list()) {
      if (NEW_KEYS.has(f.cle) || f.actif !== 1) continue;
      if (/catalogue|kit|drone|volant|moto|surron|talaria|v[ée]hicule|apple|arbi jacob/i.test(`${f.cle} ${f.nom} ${f.fichier}`)) {
        core.botFiles.toggle(f.id);
        log.info({ cle: f.cle }, "old_catalogue_disabled_v92");
      }
    }
  }
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
  // Message niveau 4 : l'ancien texte est remplacé par le message de secours paiement, sauf s'il a été personnalisé.
  if (String(core.settings.get("niveau4_message")) === NIVEAU4_MESSAGE_V8) core.settings.set("niveau4_message", NIVEAU4_MESSAGE);
}

/**
 * Script China Access V9.1 : remplace ENTIÈREMENT le catalogue en place (notice : « on ne fusionne
 * pas, on écrase »), une seule fois, et seulement si le fichier livré est complet (« FIN DU SCRIPT
 * V9.1 » tout en bas). L'ancienne version reste dans l'historique des versions du back-office.
 */
export const SCRIPT_END_MARKER = "FIN DU SCRIPT V9.2";

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
  if (!core.sends.claim("seed:catalogue:v9.2")) return false; // déjà installé une fois : Jacob garde la main ensuite
  core.catalogue.save(content, "Script V9.2 (secrétariat de Jacob + affiliés) — remplace entièrement l'ancien");
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
