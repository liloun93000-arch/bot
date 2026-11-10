"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { loginAction } from "@/lib/actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  // La vidéo démarre AU CLIC sur « Se connecter » : ce geste autorise le son sur téléphone.
  function startVideo() {
    const v = video.current;
    if (!v) return;
    setEnded(false);
    setPlaying(true);
    v.currentTime = 0;
    v.muted = false;
    v.play().catch(() => {
      // Navigateur très strict : on garde l'image animée en muet plutôt que rien.
      v.muted = true;
      v.play().catch(() => setEnded(true));
    });
  }

  function stopVideo() {
    const v = video.current;
    if (v) v.pause();
    setPlaying(false);
  }

  // Identifiants refusés : on arrête la vidéo et on montre l'erreur.
  useEffect(() => {
    if (state?.error) stopVideo();
  }, [state]);

  // Connexion acceptée ET vidéo terminée (ou passée) → accueil.
  useEffect(() => {
    if (state?.ok && (ended || !playing)) window.location.replace("/admin");
  }, [state, ended, playing]);

  return (
    <main className="aj-login">
      <form
        action={formAction}
        className="aj-login-card aj-rise space-y-4"
        onSubmit={() => {
          try {
            sessionStorage.setItem("aj-tab-ok", "1"); // cet onglet est autorisé (voir TabGuard)
          } catch {
            /* ignoré */
          }
          startVideo();
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

      {/* Vidéo d'accueil : présente dès le chargement (préchargée), visible seulement après le clic. */}
      <div className={`aj-introvid${playing ? "" : " is-hidden"}`} role="dialog" aria-label="Vidéo d'accueil" aria-hidden={!playing}>
        <video
          ref={video}
          src="/intro-connexion.mp4"
          playsInline
          preload="auto"
          onEnded={() => setEnded(true)}
          onError={() => setEnded(true)}
        />
        <button
          type="button"
          className="aj-introvid-skip"
          onClick={() => {
            stopVideo();
            setEnded(true);
          }}
        >
          Passer ›
        </button>
      </div>
    </main>
  );
}
