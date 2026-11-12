"use client";

import { useActionState, useMemo, useState } from "react";
import { bookCallAction, type BookState } from "./actions";

type Avail = Record<"15min" | "1h", Record<string, string[]>>;

function frDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export function BookingForm({ avail }: { avail: Avail }) {
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
      </div>
    );
  }
  return (
    <form action={action} className="kv-book">
      <fieldset className="kv-book-types">
        <legend>TYPE D&apos;APPEL</legend>
        <label className={type === "15min" ? "is-on" : ""}>
          <input type="radio" name="type" value="15min" checked={type === "15min"} onChange={() => setType("15min")} />
          <b>15 MIN — GRATUIT</b>
          <span>Appel WhatsApp informatif</span>
        </label>
        <label className={type === "1h" ? "is-on" : ""}>
          <input type="radio" name="type" value="1h" checked={type === "1h"} onChange={() => setType("1h")} />
          <b>1 HEURE — 25 €</b>
          <span>Paiement convenu avec le secrétariat</span>
        </label>
      </fieldset>
      <div className="kv-book-row">
        <label>
          Jour
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
          <input name="nom" required maxLength={60} autoComplete="given-name" />
        </label>
        <label>
          Numéro WhatsApp
          <input name="numero" required inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78" />
        </label>
      </div>
      <label>
        Sujet (facultatif)
        <input name="sujet" maxLength={300} placeholder="Ex. création de LLC, formation…" />
      </label>
      {state && !state.ok && <p className="kv-book-err">⚠️ {state.message}</p>}
      <button type="submit" className="btn btn-brand" disabled={pending}>
        {pending ? "ENVOI…" : "RÉSERVER UN APPEL"}
      </button>
      <small>Tous les jours de 20 h à minuit (heure de Paris), à partir de demain. Aucun paiement en ligne.</small>
    </form>
  );
}
