"use client";

import { useActionState, useMemo, useState } from "react";
import { bookCallAction, type BookState } from "./actions";

type Avail = Record<"15min" | "1h", Record<string, string[]>>;

function frDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

const I = {
  head: <path d="M4 14v-2a8 8 0 0116 0v2M4 14h3v5H5a1 1 0 01-1-1zM20 14h-3v5h2a1 1 0 001-1zM17 19c0 1.5-2 2-4 2" />,
  cal: <path d="M4 7h16v13H4zM4 11h16M8 4v4M16 4v4M10 15h4M12 13v4" />,
  day: <path d="M4 7h16v13H4zM4 11h16M8 4v4M16 4v4" />,
  clock: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2" />,
  user: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />,
  wa: <path d="M5 19l1.2-3.6A8 8 0 1112 20a8 8 0 01-3.8-1zM9 9.5c.3 2 2.5 4.2 4.5 4.5l1-1.2 2 1-.5 1.4c-3.4.4-7.4-3.6-7-7l1.4-.5 1 2z" />,
  pen: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
};
function Ico({ d }: { d: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="kv-ico">
      {d}
    </svg>
  );
}

export function BookingForm({ avail, v2 = false }: { avail: Avail; v2?: boolean }) {
  const [state, action, pending] = useActionState<BookState, FormData>(bookCallAction, null);
  const [type, setType] = useState<"15min" | "1h">("15min");
  const days = useMemo(() => Object.keys(avail[type]).filter((d) => avail[type][d]!.length > 0), [avail, type]);
  const [date, setDate] = useState(days[0] ?? "");
  const heures = avail[type][date] ?? [];

  if (state?.ok) {
    return (
      <div className="kv-book-ok" role="status">
        <b>DEMANDE ENREGISTRÉE ✓</b>
        <p>{state.message}</p>
        {state.payer && (
          <a className="btn btn-whatsapp" href={state.payer} target="_blank" rel="noopener noreferrer">
            PAYER L&apos;APPEL SUR WHATSAPP
          </a>
        )}
      </div>
    );
  }
  return (
    <form action={action} className={`kv-book${v2 ? " kv-book--v2" : ""}`}>
      <fieldset className="kv-book-types">
        <legend>TYPE D&apos;APPEL</legend>
        <label className={type === "15min" ? "is-on" : ""}>
          <input type="radio" name="type" value="15min" checked={type === "15min"} onChange={() => setType("15min")} />
          {v2 ? (
            <>
              <Ico d={I.head} />
              <b>
                15 MIN <em>OFFERTES</em>
              </b>
              <span>Appel WhatsApp informatif</span>
            </>
          ) : (
            <>
              <b>15 MIN — GRATUIT</b>
              <span>Appel WhatsApp informatif</span>
            </>
          )}
        </label>
        <label className={type === "1h" ? "is-on" : ""}>
          <input type="radio" name="type" value="1h" checked={type === "1h"} onChange={() => setType("1h")} />
          {v2 ? (
            <>
              <Ico d={I.cal} />
              <b>
                1 HEURE <em className="is-price">(25 €)</em>
              </b>
              <span>Paiement sur WhatsApp</span>
            </>
          ) : (
            <>
              <b>1 HEURE — 25 €</b>
              <span>Paiement ensuite sur WhatsApp</span>
            </>
          )}
        </label>
      </fieldset>
      <div className="kv-book-row">
        <label>
          Jour
          {v2 && <Ico d={I.day} />}
          <select name="date" value={date} onChange={(e) => setDate(e.target.value)} required>
            {days.map((d) => (
              <option key={d} value={d}>
                {frDate(d)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Heure (Paris)
          {v2 && <Ico d={I.clock} />}
          <select name="heure" required key={`${type}-${date}`}>
            {heures.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="kv-book-row">
        <label>
          Prénom
          {v2 && <Ico d={I.user} />}
          <input name="nom" required maxLength={60} autoComplete="given-name" placeholder={v2 ? "Ton prénom" : undefined} />
        </label>
        <label>
          Numéro WhatsApp
          {v2 && <Ico d={I.wa} />}
          <input name="numero" required inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78" />
        </label>
      </div>
      <label>
        Sujet (facultatif)
        {v2 && <Ico d={I.pen} />}
        <input name="sujet" maxLength={300} placeholder="Ex. création de LLC, formation…" />
      </label>
      {state && !state.ok && <p className="kv-book-err">⚠️ {state.message}</p>}
      <button type="submit" className="btn btn-brand" disabled={pending}>
        {v2 && !pending && <Ico d={I.day} />}
        {pending ? "ENVOI…" : v2 ? "RÉSERVER MON APPEL" : "RÉSERVER UN APPEL"}
        {v2 && !pending && <span className="arrow">→</span>}
      </button>
      <small>Tous les jours de 20 h à minuit (heure de Paris), à partir de demain. Aucun paiement en ligne.</small>
    </form>
  );
}
