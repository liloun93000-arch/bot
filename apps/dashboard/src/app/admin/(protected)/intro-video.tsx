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

  useEffect(() => {
    const v = ref.current;
    if (!show || !v) return;
    // Avec le son si le navigateur l'autorise, sinon en muet (règle des navigateurs mobiles).
    v.muted = false;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => close());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

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
          preload="auto"
          onEnded={close}
          onError={close}
        />
        <button type="button" className="aj-introvid-skip" onClick={close}>
          Passer ›
        </button>
      </div>
    </Portal>
  );
}
