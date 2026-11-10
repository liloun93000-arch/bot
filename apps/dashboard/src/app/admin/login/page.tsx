"use client";

import { useActionState, useEffect } from "react";
import { canRun3D } from "@/app/(site)/_components/intro/can3d";
import { loginAction } from "@/lib/actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, null);

  // Préchargement de l'intro Jacob & Lilou pendant que l'on saisit les identifiants (rien n'est affiché).
  useEffect(() => {
    if (!canRun3D()) return;
    const t = setTimeout(() => {
      void import("@/app/(site)/_components/intro/engine3d").then((m) => m.preloadIntro3D()).catch(() => undefined);
    }, 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="aj-login">
      <form
        action={formAction}
        className="aj-login-card aj-rise space-y-4"
        onSubmit={() => {
          // L'intro se jouera par-dessus le dashboard dès qu'il est chargé (voir admin-intro.tsx).
          try {
            sessionStorage.setItem("aj-tab-ok", "1"); // cet onglet est autorisé (voir TabGuard)
            sessionStorage.setItem("aj-intro-pending", "1");
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
