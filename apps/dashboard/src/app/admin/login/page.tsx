"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <main className="aj-login">
      <form
        action={formAction}
        className="aj-login-card aj-rise space-y-4"
        onSubmit={() => {
          try {
            sessionStorage.setItem("aj-tab-ok", "1"); // cet onglet est autorisé (voir TabGuard)
            sessionStorage.setItem("aj-video-pending", "1"); // vidéo d'accueil après CETTE connexion
          } catch {
            /* ignoré */
          }
        }}
      >
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/brand/logo.webp" alt="ARBI JACOB" style={{ height: 120, width: "auto", maxWidth: "100%", objectFit: "contain" }} />
          <p className="mt-1 text-sm text-neutral-500">Back-office de l&apos;agent WhatsApp</p>
        </div>
        <div>
          <label className="label" htmlFor="username">
            Identifiant
          </label>
          <input id="username" name="username" className="input" autoComplete="username" required />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Mot de passe
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete="current-password"
            required
          />
        </div>
        {state?.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
        <button type="submit" className="btn btn-primary w-full" style={{ padding: "0.7rem 1rem" }} disabled={pending}>
          {pending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
