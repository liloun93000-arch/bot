import type { Core } from "@arbi/core";
import { parisMidnight, parisYmd } from "./period";

/**
 * Réservation d'appel (vitrine) : tous les jours 20 h – minuit (heure de Paris), à partir du
 * lendemain. Créneaux de 30 min ; un appel de 15 min occupe 1 créneau, un appel d'1 h en occupe 2.
 * Unicité garantie par la base (créneau = clé unique) : aucun double rendez-vous possible.
 * Chaque réservation crée une alerte visible dans l'onglet Jacob.
 */

export const SLOTS = ["20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"];
export const DAYS_AHEAD = 14;
export type CallType = "15min" | "1h";
export const CALL_LABEL: Record<CallType, string> = {
  "15min": "Appel WhatsApp informatif — 15 min, gratuit",
  "1h": "Appel d'une heure — 25 €",
};

const ready = new WeakSet<object>();
export function ensureBookings(core: Core): void {
  if (ready.has(core)) return;
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS call_bookings (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       date TEXT NOT NULL, heure TEXT NOT NULL, type TEXT NOT NULL,
       nom TEXT NOT NULL, wa_id TEXT NOT NULL, sujet TEXT NOT NULL DEFAULT '',
       alert_id INTEGER, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS call_slots (
       date TEXT NOT NULL, heure TEXT NOT NULL, booking_id INTEGER NOT NULL,
       PRIMARY KEY (date, heure))`,
  ]) core.sqlite.prepare(sql).run();
  // Statut de validation par l'équipe : en_attente → approuve / refuse.
  try {
    core.sqlite.prepare(`ALTER TABLE call_bookings ADD COLUMN statut TEXT NOT NULL DEFAULT 'en_attente'`).run();
  } catch {
    /* colonne déjà là */
  }
  ready.add(core);
}

/** Jours réservables : du lendemain à J+14 (heure de Paris). */
export function bookableDays(now = Date.now()): string[] {
  const today = parisYmd(now);
  const out: string[] = [];
  let t = parisMidnight(today);
  for (let i = 1; i <= DAYS_AHEAD; i++) {
    t += 86_400_000;
    out.push(parisYmd(t + 3 * 3_600_000));
  }
  return out;
}

function slotsFor(type: CallType, heure: string): string[] | null {
  const i = SLOTS.indexOf(heure);
  if (i < 0) return null;
  if (type === "15min") return [heure];
  const next = SLOTS[i + 1];
  return next ? [heure, next] : null; // un appel d'1 h doit finir avant minuit
}

/** Créneaux de départ libres par jour et par type d'appel. */
export function availability(core: Core, now = Date.now()): Record<CallType, Record<string, string[]>> {
  ensureBookings(core);
  const days = bookableDays(now);
  const taken = new Set(
    (core.sqlite.prepare(`SELECT date || ' ' || heure AS k FROM call_slots WHERE date >= ?`).all(days[0]) as Array<{ k: string }>).map(
      (r) => r.k,
    ),
  );
  const res: Record<CallType, Record<string, string[]>> = { "15min": {}, "1h": {} };
  for (const type of ["15min", "1h"] as CallType[]) {
    for (const d of days) {
      res[type][d] = SLOTS.filter((h) => {
        const need = slotsFor(type, h);
        return need !== null && need.every((s) => !taken.has(`${d} ${s}`));
      });
    }
  }
  return res;
}

export type BookResult = { ok: true; id: number } | { ok: false; error: string };

export function book(
  core: Core,
  input: { type: CallType; date: string; heure: string; nom: string; numero: string; sujet: string },
  now = Date.now(),
): BookResult {
  ensureBookings(core);
  if (!bookableDays(now).includes(input.date)) return { ok: false, error: "Choisis une date à partir de demain (14 jours maximum)." };
  const need = slotsFor(input.type, input.heure);
  if (!need) return { ok: false, error: "Ce créneau n'existe pas pour ce type d'appel." };
  const waId = input.numero.replace(/[^\d]/g, "").replace(/^0(\d{9})$/, "33$1");
  if (waId.length < 9 || waId.length > 15) return { ok: false, error: "Numéro WhatsApp invalide (ex. 06 12 34 56 78 ou +33 6…)." };
  const nom = input.nom.trim().slice(0, 60);
  if (!nom) return { ok: false, error: "Indique ton prénom." };

  const insBooking = core.sqlite.prepare(
    `INSERT INTO call_bookings (date, heure, type, nom, wa_id, sujet, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insSlot = core.sqlite.prepare(`INSERT INTO call_slots (date, heure, booking_id) VALUES (?, ?, ?)`);
  core.sqlite.prepare("BEGIN IMMEDIATE").run();
  try {
    const r = insBooking.run(input.date, input.heure, input.type, nom, waId, input.sujet.trim().slice(0, 300), now) as {
      lastInsertRowid: number | bigint;
    };
    const id = Number(r.lastInsertRowid);
    for (const s of need) insSlot.run(input.date, s, id); // échoue si le créneau est déjà pris
    core.sqlite.prepare("COMMIT").run();

    // Alerte dans l'onglet Jacob (et la conversation apparaît dans le dashboard).
    core.contacts.upsert(waId, nom);
    const [y, m, d] = input.date.split("-");
    const alertId = core.alerts.create({
      waId,
      categorie: "Réservation d'appel",
      intention: input.type,
      motif: `📞 Réservation : ${CALL_LABEL[input.type]} le ${d}/${m}/${y} à ${input.heure} (heure de Paris)`,
      resume: `${nom} — WhatsApp +${waId}${input.sujet.trim() ? ` — Sujet : ${input.sujet.trim().slice(0, 200)}` : ""}`,
      dernierMessage: input.sujet.trim().slice(0, 300) || `Réservation ${CALL_LABEL[input.type]}`,
    });
    core.sqlite.prepare(`UPDATE call_bookings SET alert_id = ? WHERE id = ?`).run(alertId, id);
    return { ok: true, id };
  } catch {
    try {
      core.sqlite.prepare("ROLLBACK").run();
    } catch {
      /* déjà annulé */
    }
    return { ok: false, error: "Ce créneau vient d'être pris. Choisis-en un autre." };
  }
}

export interface Booking {
  id: number;
  date: string;
  heure: string;
  type: CallType;
  nom: string;
  waId: string;
  sujet: string;
  alertId: number | null;
  statut: "en_attente" | "approuve" | "refuse";
  createdAt: number;
}

export function listBookings(core: Core, opts: { depuis?: string } = {}): Booking[] {
  ensureBookings(core);
  const rows = core.sqlite
    .prepare(
      `SELECT id, date, heure, type, nom, wa_id, sujet, alert_id, statut, created_at FROM call_bookings
       WHERE date >= ? ORDER BY date ASC, heure ASC`,
    )
    .all(opts.depuis ?? "0000-00-00") as Array<{ id: number; date: string; heure: string; type: CallType; nom: string; wa_id: string; sujet: string; alert_id: number | null; statut: Booking["statut"]; created_at: number }>;
  return rows.map((r) => ({ id: r.id, date: r.date, heure: r.heure, type: r.type, nom: r.nom, waId: r.wa_id, sujet: r.sujet, alertId: r.alert_id, statut: r.statut, createdAt: r.created_at }));
}

export function getBooking(core: Core, id: number): Booking | undefined {
  return listBookings(core).find((b) => b.id === id);
}

/** Approuver ou refuser. Refuser libère le créneau. L'alerte associée passe en traitée. */
export function decideBooking(core: Core, id: number, decision: "approuve" | "refuse"): Booking | undefined {
  ensureBookings(core);
  const b = getBooking(core, id);
  if (!b || b.statut !== "en_attente") return b;
  core.sqlite.prepare(`UPDATE call_bookings SET statut = ? WHERE id = ?`).run(decision, id);
  if (decision === "refuse") core.sqlite.prepare(`DELETE FROM call_slots WHERE booking_id = ?`).run(id);
  if (b.alertId) core.alerts.markTreated(b.alertId);
  return { ...b, statut: decision };
}

/** Message envoyé au client quand le rendez-vous est approuvé. */
export function approvalMessage(b: Booking, paiementNumero: string): string {
  const [y, m, d] = b.date.split("-");
  const base = `Bonjour ${b.nom} ✅ Ton rendez-vous est confirmé : ${b.type === "1h" ? "appel d'une heure" : "appel de 15 minutes"} le ${d}/${m}/${y} à ${b.heure} (heure de Paris). Jacob t'appellera sur ce numéro WhatsApp.`;
  return b.type === "1h" ? `${base} Pour régler l'appel (25 €), écris sur WhatsApp au ${paiementNumero}.` : base;
}
