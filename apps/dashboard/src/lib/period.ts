/** Filtres de période du tableau de bord : Aujourd'hui, Hier, 7 jours, 30 jours, dates personnalisées. */

export type PeriodKey = "aujourdhui" | "hier" | "7j" | "30j" | "perso";

export interface Period {
  key: PeriodKey;
  from: number;
  to: number;
  label: string;
  du: string;
  au: string;
}

export const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: "aujourdhui", label: "Aujourd'hui" },
  { key: "hier", label: "Hier" },
  { key: "7j", label: "7 jours" },
  { key: "30j", label: "30 jours" },
  { key: "perso", label: "Dates…" },
];

const TZ = "Europe/Paris";
const DAY = 86_400_000;

/** Minuit (heure de Paris) du jour donné au format AAAA-MM-JJ, en millisecondes UTC. */
export function parisMidnight(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  // Décalage de Paris à cette date (été / hiver)
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).formatToParts(new Date(guess));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  return guess - hour * 3_600_000;
}

export function parisYmd(ts: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
}

function fr(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export function parsePeriod(params: { periode?: string; du?: string; au?: string }, now = Date.now()): Period {
  const today = parisYmd(now);
  const startToday = parisMidnight(today);
  const key = (PERIOD_OPTIONS.some((o) => o.key === params.periode) ? params.periode : "30j") as PeriodKey;
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  switch (key) {
    case "aujourdhui":
      return { key, from: startToday, to: now, label: `Aujourd'hui (${fr(today)})`, du: today, au: today };
    case "hier": {
      const y = parisYmd(startToday - DAY / 2);
      return { key, from: parisMidnight(y), to: startToday, label: `Hier (${fr(y)})`, du: y, au: y };
    }
    case "7j": {
      const d = parisYmd(startToday - 6 * DAY + DAY / 2);
      return { key, from: parisMidnight(d), to: now, label: `7 derniers jours (${fr(d)} → ${fr(today)})`, du: d, au: today };
    }
    case "perso": {
      let du = isDate(params.du) ? params.du! : today;
      let au = isDate(params.au) ? params.au! : today;
      if (du > au) [du, au] = [au, du];
      const lendemain = parisYmd(parisMidnight(au) + DAY + 3 * 3_600_000);
      const to = Math.min(now, parisMidnight(lendemain));
      return { key, from: parisMidnight(du), to, label: du === au ? `Le ${fr(du)}` : `Du ${fr(du)} au ${fr(au)}`, du, au };
    }
    default: {
      const d = parisYmd(startToday - 29 * DAY + DAY / 2);
      return { key: "30j", from: parisMidnight(d), to: now, label: `30 derniers jours (${fr(d)} → ${fr(today)})`, du: d, au: today };
    }
  }
}

/** Période précédente de même durée (pour l'évolution). */
export function previousPeriod(p: Period): { from: number; to: number } {
  const len = p.to - p.from;
  return { from: p.from - len, to: p.from };
}
