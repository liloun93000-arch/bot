import Link from "next/link";
import { PERIOD_OPTIONS, type Period } from "@/lib/period";

/** Filtre de période (liens + dates personnalisées), sans JavaScript : la page se recalcule. */
export function PeriodFilter({ period, base = "/admin", ancre = "periode" }: { period: Period; base?: string; ancre?: string }) {
  return (
    <div className="aj-period">
      {PERIOD_OPTIONS.filter((o) => o.key !== "perso").map((o) => (
        <Link key={o.key} href={`${base}?periode=${o.key}#${ancre}`} className={period.key === o.key ? "is-on" : ""} scroll={false}>
          {o.label}
        </Link>
      ))}
      <form action={base} method="get" className="aj-period-custom">
        <input type="hidden" name="periode" value="perso" />
        <input type="date" name="du" defaultValue={period.du} className="input" aria-label="Date de début" />
        <input type="date" name="au" defaultValue={period.au} className="input" aria-label="Date de fin" />
        <button type="submit" className={`btn ${period.key === "perso" ? "btn-primary" : "btn-secondary"}`}>
          Dates
        </button>
      </form>
      <span className="aj-period-label">Période active : {period.label}</span>
    </div>
  );
}
