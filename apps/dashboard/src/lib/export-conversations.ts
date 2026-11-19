import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { displayMediaText, type Core } from "@arbi/core";
import { mediaDir } from "./media";
import { ZipWriter } from "./zip-writer";

/**
 * Export des conversations en ZIP : tâche de fond côté serveur (le dashboard reste
 * utilisable), progression RÉELLE (conversations puis médias traités), état écrit
 * sur disque pour survivre à un rechargement de page. Aucun appel IA ni
 * transcription : on n'exporte que ce qui existe en base.
 */
export type ExportStep = "preparation" | "conversations" | "medias" | "archive" | "termine" | "erreur";

export interface ExportJob {
  id: string;
  etat: "demarre" | "en_cours" | "termine" | "erreur";
  etape: ExportStep;
  libelle: string;
  totalConversations: number;
  conversationsFaites: number;
  totalMedias: number;
  mediasFaits: number;
  mediasManquants: number;
  /** 0–100, calculé sur le travail réellement effectué. */
  pourcent: number;
  fichier: string;
  taille: number;
  erreur: string;
  debut: number;
  fin: number | null;
}

export function dbFile(): string {
  return process.env.DB_PATH ?? join(process.cwd(), "..", "..", "data", "agent.db");
}

export function exportDir(dbPath: string = dbFile()): string {
  return process.env.EXPORT_DIR ?? join(dirname(dbPath), "exports");
}

const JOB_ID_RE = /^[a-f0-9]{16}$/;
export const isJobId = (s: string): boolean => JOB_ID_RE.test(s);

const g = globalThis as unknown as { __ajExportJobs?: Map<string, ExportJob>; __ajExportRunning?: boolean };
const jobs = (g.__ajExportJobs ??= new Map());

function persist(dir: string, job: ExportJob): void {
  try {
    writeFileSync(join(dir, `${job.id}.json`), JSON.stringify(job));
  } catch {
    /* l'état mémoire reste la référence */
  }
}

export function getJob(dir: string, id: string): ExportJob | null {
  if (!isJobId(id)) return null;
  const live = jobs.get(id);
  if (live) return live;
  try {
    const job = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")) as ExportJob;
    // Tâche « en cours » héritée d'un redémarrage du serveur : elle est perdue.
    if (job.etat === "demarre" || job.etat === "en_cours") {
      return { ...job, etat: "erreur", etape: "erreur", erreur: "Export interrompu (redémarrage du serveur). Relancez-le.", libelle: "Interrompu" };
    }
    return job;
  } catch {
    return null;
  }
}

/** Supprime les exports de plus de 24 h : ils contiennent des données clients. */
function purgeOld(dir: string): void {
  try {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (Date.now() - statSync(p).mtimeMs > 24 * 3600 * 1000) unlinkSync(p);
    }
  } catch {
    /* dossier absent */
  }
}

const ROLE_LABEL: Record<string, string> = { user: "Client", assistant: "Bot", human: "Jacob (manuel)" };
const FR = (ts: number) =>
  new Date(ts).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "medium" });
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "client";
const VOICE_RE = /^\[Message vocal\] ([\s\S]+)$/;

interface MsgRow {
  id: number; role: string; contenu: string; ts: number; mediaType: string; mediaFile: string; mediaMime: string;
}

export function startExport(core: Core, dbPath: string, waIds: string[]): ExportJob {
  const dir = exportDir(dbPath);
  mkdirSync(dir, { recursive: true });
  purgeOld(dir);
  if (g.__ajExportRunning) throw new Error("Un export est déjà en cours. Attendez sa fin.");
  const unique = [...new Set(waIds)];
  const job: ExportJob = {
    id: randomBytes(8).toString("hex"), etat: "demarre", etape: "preparation", libelle: "Préparation de l'export…",
    totalConversations: unique.length, conversationsFaites: 0, totalMedias: 0, mediasFaits: 0, mediasManquants: 0,
    pourcent: 0, fichier: "", taille: 0, erreur: "", debut: Date.now(), fin: null,
  };
  jobs.set(job.id, job);
  persist(dir, job);
  g.__ajExportRunning = true;
  // Démarre hors de la requête : le dashboard répond tout de suite.
  setTimeout(() => {
    runExport(core, dir, job, unique)
      .catch((err: unknown) => {
        job.etat = "erreur"; job.etape = "erreur"; job.libelle = "Échec de l'export"; job.erreur = String((err as Error)?.message ?? err);
      })
      .finally(() => {
        g.__ajExportRunning = false;
        job.fin = Date.now();
        persist(dir, job);
      });
  }, 0);
  return job;
}

const tick = () => new Promise<void>((r) => setImmediate(r));

function update(dir: string, job: ExportJob): void {
  // Répartition honnête : 5 % préparation, 45 % conversations, 45 % médias, 5 % archive.
  const conv = job.totalConversations ? job.conversationsFaites / job.totalConversations : 1;
  const med = job.totalMedias ? job.mediasFaits / job.totalMedias : 1;
  const base = job.etape === "preparation" ? 0 : job.etape === "conversations" ? 5 + 45 * conv : job.etape === "medias" ? 50 + 45 * med : job.etape === "archive" ? 97 : 100;
  job.pourcent = Math.min(100, Math.round(base));
  persist(dir, job);
}

async function runExport(core: Core, dir: string, job: ExportJob, waIds: string[]): Promise<void> {
  job.etat = "en_cours";
  const sql = core.sqlite;
  const mdir = mediaDir();
  const zipName = `export-conversations-${new Date().toISOString().slice(0, 10)}-${job.id.slice(0, 6)}.zip`;
  const zipPath = join(dir, zipName);
  const zip = new ZipWriter(zipPath);
  try {
    // 1. Conversations (lecture base, par lots pour laisser respirer le serveur).
    job.etape = "conversations"; job.libelle = "Récupération des conversations…"; update(dir, job);
    const index: Array<Record<string, unknown>> = [];
    const jsonAll: Array<Record<string, unknown>> = [];
    const mediaJobs: Array<{ entry: string; file: string; conv: string }> = [];
    const readable: Array<{ folder: string; text: string }> = [];

    for (const waId of waIds) {
      const contact = core.contacts.get(waId);
      const rows = core.messages.fullTranscript(waId) as MsgRow[];
      const leads = core.leads.list().filter((l) => l.waId === waId);
      const alertes = core.alerts.listFor(waId);
      const demandes = sql
        .prepare(`SELECT texte, categorie, demande, raison, categorie_manuelle AS manuelle, created_at AS ts FROM questions WHERE wa_id = ? ORDER BY created_at`)
        .all(waId) as Array<{ texte: string; categorie: string; demande: number; raison: string; manuelle: number; ts: number }>;
      const nom = contact?.nom ?? "";
      const folder = `conversations/${waId}-${slug(nom || "client")}`;

      const messages = rows.map((m) => {
        const transcription = m.mediaType === "audio" ? VOICE_RE.exec(m.contenu)?.[1]?.trim() || null : null;
        const texte = displayMediaText(m.contenu, m.mediaFile, m.mediaMime);
        let media: Record<string, unknown> | null = null;
        if (m.mediaType) {
          const ext = m.mediaFile.includes(".") ? m.mediaFile.slice(m.mediaFile.lastIndexOf(".")) : "";
          const entry = m.mediaFile ? `${folder}/medias/${m.id}-${m.mediaType}${ext}` : null;
          if (entry) { mediaJobs.push({ entry, file: m.mediaFile, conv: waId }); job.totalMedias++; }
          media = { type: m.mediaType, mime: m.mediaMime, fichier: entry, statut: entry ? "a_verifier" : "non_recupere_par_whatsapp" };
        }
        return {
          id: m.id, date_iso: new Date(m.ts).toISOString(), date_paris: FR(m.ts),
          auteur: m.role === "user" ? "client" : m.role === "assistant" ? "bot" : "jacob_manuel",
          texte, transcription_vocale: transcription, media,
        };
      });
      const conv = {
        conversation_id: waId, telephone: `+${waId}`, nom,
        statut_conversation: { mode_humain: !!contact?.modeHumain, opt_out: !!contact?.optOut },
        premier_message: rows[0] ? new Date(rows[0].ts).toISOString() : null,
        dernier_message: rows.length ? new Date(rows[rows.length - 1]!.ts).toISOString() : null,
        statut_commercial: leads.map((l) => ({ offre: l.offre, statut: l.statut, score: l.score, besoin: l.besoin, budget: l.budget, delai: l.delai, date: new Date(l.ts).toISOString() })),
        categories_demandes: demandes.map((d) => ({ date: new Date(d.ts).toISOString(), message: d.texte, categorie: d.categorie, comptee: !!d.demande, raison_exclusion: d.raison, corrigee_manuellement: !!d.manuelle })),
        alertes: alertes.map((a) => ({ id: a.id, date: new Date(a.createdAt).toISOString(), statut: a.statut, motif: a.motif, resume: a.resume, dernier_message: a.dernierMessage, note_cloture: a.clotureNote })),
        messages,
      };
      jsonAll.push(conv);

      const lines = [
        `CONVERSATION ${nom || "(sans nom)"} — +${waId}`,
        `Messages : ${rows.length}`,
        leads.length ? `Statut commercial : ${leads.map((l) => `${l.offre} (${l.statut})`).join(", ")}` : "Statut commercial : aucun lead",
        demandes.length ? `Catégories : ${[...new Set(demandes.filter((d) => d.demande).map((d) => d.categorie))].join(", ") || "—"}` : "Catégories : —",
        alertes.length ? `Alertes : ${alertes.map((a) => `#${a.id} ${a.statut} — ${a.motif}`).join(" | ")}` : "Alertes : aucune",
        "", "—".repeat(40), "",
      ];
      for (const m of messages) {
        lines.push(`[${m.date_paris}] ${ROLE_LABEL[m.auteur === "client" ? "user" : m.auteur === "bot" ? "assistant" : "human"]} :`);
        if (m.texte) lines.push(m.texte);
        if (m.media) {
          const md = m.media as { type: string; fichier: string | null };
          lines.push(md.fichier ? `📎 ${md.type} : ${md.fichier}` : `📎 ${md.type} : non récupéré (indisponible)`);
        }
        if (m.transcription_vocale) lines.push(`🎤 Transcription : ${m.transcription_vocale}`);
        lines.push("");
      }
      readable.push({ folder, text: lines.join("\n") });
      index.push({
        conversation_id: waId, nom, telephone: `+${waId}`, messages: rows.length,
        premier_message: conv.premier_message, dernier_message: conv.dernier_message,
        dossier: folder, statut_commercial: leads[0]?.statut ?? null, alertes: alertes.length,
      });
      job.conversationsFaites++;
      update(dir, job);
      await tick();
    }

    // 2. Écriture des textes dans l'archive.
    await zip.add("index.json", Buffer.from(JSON.stringify({ genere_le: new Date().toISOString(), conversations: index }, null, 2)));
    await zip.add(
      "index.txt",
      Buffer.from(index.map((i) => `${i.nom || "(sans nom)"} — ${i.telephone} — ${i.messages} message(s) — ${i.dossier}`).join("\n") + "\n"),
    );
    await zip.add("conversations.json", Buffer.from(JSON.stringify({ format: "arbi-jacob-export-v1", genere_le: new Date().toISOString(), conversations: jsonAll }, null, 2)));
    await zip.add(
      "LISEZ-MOI.txt",
      Buffer.from(
        "Export des conversations ARBI JACOB\n\n" +
          "- index.json / index.txt : liste des conversations exportées\n" +
          "- conversations.json : toutes les données structurées (utilisable par une IA)\n" +
          "- conversations/<numéro>-<nom>/conversation.txt : version lisible\n" +
          "- conversations/<numéro>-<nom>/medias/ : photos, documents, vocaux réellement récupérés\n" +
          "- medias_manquants.txt : médias dont le fichier est introuvable (liste précise)\n\n" +
          "Les transcriptions de vocaux sont celles déjà enregistrées ; aucune n'a été générée pour cet export.\n",
      ),
    );
    for (const r of readable) await zip.add(`${r.folder}/conversation.txt`, Buffer.from(r.text, "utf8"));

    // 3. Médias : vrais fichiers copiés, jamais de lien temporaire.
    job.etape = "medias"; job.libelle = job.totalMedias ? "Récupération des médias…" : "Aucun média à récupérer"; update(dir, job);
    const manquants: string[] = [];
    for (const m of mediaJobs) {
      try {
        if (m.file.includes("/") || m.file.includes("\\") || m.file.includes("..")) throw new Error("nom invalide");
        const data = await readFile(join(mdir, m.file));
        await zip.add(m.entry, data, { compress: false });
      } catch {
        job.mediasManquants++;
        manquants.push(`${m.conv} : ${m.file} (fichier introuvable sur le serveur)`);
      }
      job.mediasFaits++;
      if (job.mediasFaits % 5 === 0) { update(dir, job); await tick(); }
    }
    // Messages dont le média n'a jamais été récupéré par WhatsApp.
    const sansFichier = jsonAll.flatMap((c) =>
      (c.messages as Array<{ id: number; media: { type: string; fichier: string | null } | null }>)
        .filter((m) => m.media && !m.media.fichier)
        .map((m) => `${c.conversation_id} : message ${m.id} (${m.media!.type}) — média non récupéré à la réception`),
    );
    if (manquants.length || sansFichier.length) {
      await zip.add("medias_manquants.txt", Buffer.from([...manquants, ...sansFichier].join("\n") + "\n"));
    }

    job.etape = "archive"; job.libelle = "Création de l'archive…"; update(dir, job);
    await zip.finish();
    job.fichier = zipName;
    job.taille = statSync(zipPath).size;
    job.etat = "termine"; job.etape = "termine"; job.libelle = "Téléchargement disponible"; job.pourcent = 100;
    persist(dir, job);
  } catch (err) {
    zip.abort();
    try { unlinkSync(zipPath); } catch { /* rien */ }
    throw err;
  }
}

export function exportFilePath(dir: string, job: ExportJob): string | null {
  if (job.etat !== "termine" || !/^[\w.-]+\.zip$/.test(job.fichier)) return null;
  return join(dir, job.fichier);
}
