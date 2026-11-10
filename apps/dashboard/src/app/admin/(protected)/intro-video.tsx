"use client";

import { useEffect, useRef, useState } from "react";
import { Portal } from "./portal";

/**
 * Vidéo d'accueil jouée UNE fois juste après chaque connexion (repère posé par la page de
 * connexion, retiré dès la lecture) : jamais en revenant simplement sur l'accueil.
 * Bouton « Passer » discret ; à la fin, l'accueil apparaît.
 */
export function IntroVideo() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("aj-video-pending") === "1") {
        sessionStorage.removeItem("aj-video-pending");
        setShow(true);
      }
    } catch {
      /* stockage indisponible : pas de vidéo */
    }
  }, []);

  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const v = ref.current;
    if (!show || !v) return;
    // Lecture automatique en MUET : c'est la seule que les téléphones (iPhone surtout) autorisent
    // sans geste de l'utilisateur. Le son s'active avec le petit bouton 🔊.
    v.muted = true;
    v.play().catch(() => setBlocked(true));
    // Filet : si rien n'a démarré après 1,5 s (mode économie d'énergie…), on propose ▶.
    const t = window.setTimeout(() => {
      if (v.paused || v.currentTime === 0) setBlocked(true);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [show]);

  function playWithSound() {
    const v = ref.current;
    if (!v) return;
    v.muted = false;
    setMuted(false);
    v.play()
      .then(() => setBlocked(false))
      .catch(() => {
        v.muted = true;
        setMuted(true);
        v.play().then(() => setBlocked(false)).catch(() => undefined);
      });
  }

  function toggleSound() {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (v.paused) void v.play().catch(() => undefined);
  }

  function close() {
    setLeaving(true);
    window.setTimeout(() => setShow(false), 350);
  }

  if (!show) return null;
  return (
    <Portal onClose={close}>
      <div className={`aj-introvid${leaving ? " is-leaving" : ""}`} role="dialog" aria-label="Vidéo d'accueil">
        <video
          ref={ref}
          src="/intro-connexion.mp4"
          poster="/intro-connexion.jpg"
          playsInline
          autoPlay
          muted
          preload="auto"
          onPlaying={() => setBlocked(false)}
          onEnded={close}
          onError={close}
        />
        {blocked && (
          <button type="button" className="aj-introvid-play" onClick={playWithSound} aria-label="Lancer la vidéo">
            ▶
          </button>
        )}
        {!blocked && (
          <button type="button" className="aj-introvid-sound" onClick={toggleSound} aria-label={muted ? "Activer le son" : "Couper le son"}>
            {muted ? "🔇" : "🔊"}
          </button>
        )}
        <button type="button" className="aj-introvid-skip" onClick={close}>
          Passer ›
        </button>
      </div>
    </Portal>
  );
}
