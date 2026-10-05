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
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        action={formAction}
        className="card w-full max-w-sm space-y-4"
        onSubmit={() => {
          // L'intro se jouera par-dessus le dashboard dès qu'il est chargé (voir admin-intro.tsx).
          try {
            sessionStorage.setItem("aj-intro-pending", "1");
          } catch {
            /* ignoré */
          }
        }}
      >
        <div>
          <h1 className="text-xl font-bold">ARBI JACOB</h1>
          <p className="text-sm text-neutral-500">Back-office de l&apos;agent WhatsApp</p>
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
        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
