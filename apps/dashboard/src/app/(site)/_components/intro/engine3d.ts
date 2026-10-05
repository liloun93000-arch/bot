/**
 * Moteur de l'intro 3D : WebGL (three.js) + modèles de Jacob et Lilou + bulles HTML.
 * Même contrat que le moteur 2D (`mountIntro`) : le site peut basculer de l'un à l'autre
 * (si la 3D n'est pas disponible ou trop lente, on joue l'intro 2D validée).
 */
import { Bubble } from "./bubble";
import { canRun3D } from "./can3d";
import { Character } from "./character3d";
import { Clock, IntroCancelled } from "./clock";
import type { IntroState } from "./config";
import { TIMING } from "./config";
import { CHARACTER_HEIGHT_3D, QUALITY, TIMING3, WALK } from "./config3d";
import { loadModel, MODEL_HEIGHT, preloadModels } from "./model3d";
import { markIntroSeen } from "./session";
import { Stage } from "./stage3d";
import { runTimeline3D } from "./timeline3d";

export interface Mount3DOptions {
  mode?: "fixed" | "contained";
  container?: HTMLElement;
  onRevealStart?: () => void;
  onDone?: () => void;
  onState?: (s: IntroState | "SKIPPED") => void;
  remember?: boolean;
  /** true : ne pas refuser l'appareil même si le test de vitesse est mauvais (démo, tests). */
  force?: boolean;
  /** Niveau de qualité imposé (0 = max). */
  tier?: number;
}
export interface Intro3DHandle {
  overlay: HTMLElement;
  skip: () => void;
  stop: () => void;
  done: Promise<void>;
  stats: () => { tier: number; fps: number; t: number };
}
export class Intro3DUnavailable extends Error {
  constructor(why: string) {
    super("intro3d-unavailable: " + why);
  }
}

export { canRun3D, preloadModels as preloadIntro3D };

export async function mountIntro3D(opts: Mount3DOptions): Promise<Intro3DHandle> {
  const mode = opts.mode ?? "fixed";
  const host = opts.container ?? document.body;

  const overlay = document.createElement("div");
  overlay.className = "aj-intro aj-intro3d aj-intro3d-pre" + (mode === "contained" ? " aj-intro-contained" : "");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Introduction animée ARBI JACOB");
  const canvas = document.createElement("canvas");
  canvas.className = "aj-intro3d-canvas";
  const ui = document.createElement("div");
  ui.className = "aj-intro-stage";
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "aj-intro-skip";
  skip.textContent = "Passer";
  skip.setAttribute("aria-label", "Passer l'introduction");
  overlay.append(canvas, ui, skip);
  host.append(overlay);

  const stage = new Stage(canvas, opts.tier ?? 0);
  let jacob!: Character;
  let lilou!: Character;
  try {
    // ── Préchargement COMPLET avant de lancer quoi que ce soit : modèles, textures, shaders, GPU.
    const r0 = overlay.getBoundingClientRect();
    stage.resize(Math.max(280, r0.width), Math.max(320, r0.height));
    const aniso = stage.renderer.capabilities.getMaxAnisotropy();
    const [mj, ml] = await Promise.all([loadModel("jacob", aniso), loadModel("lilou", aniso)]);
    const scale = (CHARACTER_HEIGHT_3D.scale * 1.9) / MODEL_HEIGHT;
    jacob = new Character("jacob", mj, scale, { cycle: WALK.cycle, seed: 0 });
    lilou = new Character("lilou", ml, scale, { cycle: WALK.cycle * 0.96, seed: 1.7 });
    stage.actors.add(jacob.group, lilou.group);
    stage.addBlob(jacob.group);
    stage.addBlob(lilou.group);
    jacob.group.position.set(-0.5, 0, 0);
    lilou.group.position.set(0.5, 0, 0);
    stage.cut({ cx: 0, cy: 1, h: 6, w: 3, az: 0, el: 0, lz: 0 });
    stage.update(0.016, 0);
    stage.renderer.compile(stage.scene, stage.camera);
    for (let i = 0; i < 2; i++) stage.render();

    // ── Test de vitesse : si l'appareil ne tient pas, la main revient à l'intro 2D.
    if (!opts.force) {
      const gl = stage.renderer.getContext();
      for (let tier = opts.tier ?? 0; tier < QUALITY.length; tier++) {
        stage.setTier(tier);
        stage.render();
        gl.finish();
        const t0 = performance.now();
        const N = 12;
        for (let i = 0; i < N; i++) {
          jacob.update(0.016);
          lilou.update(0.016);
          stage.update(0.016, 0.016 * i);
          stage.render();
          gl.finish();
        }
        const ms = (performance.now() - t0) / N;
        if (ms < (tier === QUALITY.length - 1 ? 30 : 17)) break;
        if (tier === QUALITY.length - 1) throw new Intro3DUnavailable(`trop lent (${ms.toFixed(0)} ms/image)`);
      }
    } else if (opts.tier !== undefined) stage.setTier(opts.tier);
  } catch (e) {
    overlay.remove();
    stage.dispose();
    throw e;
  }

  if (opts.remember !== false) markIntroSeen();
  // Tout est chargé, compilé, chauffé : seulement maintenant l'intro apparaît (aucun personnage ni texture qui « pop »).
  overlay.style.setProperty("--aj-fade", TIMING3.fadeIn + "ms");
  void overlay.offsetWidth;
  overlay.classList.remove("aj-intro3d-pre");

  const clock = new Clock();
  const bubble = new Bubble(ui);
  let W = 1;
  let H = 1;
  const fit = (): void => {
    const r = overlay.getBoundingClientRect();
    W = Math.max(280, r.width);
    H = Math.max(320, r.height);
    stage.resize(W, H);
  };
  fit();
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => fit()) : null;
  ro?.observe(overlay);

  // ── Boucle : animation, caméra, rendu, bulles, qualité adaptative.
  let slow = 0;
  let fpsAvg = 60;
  const offTick = clock.onTick((dt, t) => {
    jacob.update(dt);
    lilou.update(dt);
    stage.update(dt, t);
    if (clock.rendering) stage.render();
    bubble.place();
    fpsAvg += (1 / Math.max(dt, 1e-3) - fpsAvg) * 0.05;
    if (t > 1.5) {
      slow = fpsAvg < 40 ? slow + 1 : Math.max(0, slow - 2);
      if (slow > 90 && stage.tier < QUALITY.length - 1) {
        stage.setTier(stage.tier + 1);
        slow = 0;
      }
    }
  });

  let finished = false;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((r) => (resolveDone = r));
  const cleanup = (): void => {
    if (finished) return;
    finished = true;
    clock.cancel();
    clock.stop();
    offTick();
    ro?.disconnect();
    document.removeEventListener("keydown", onKey);
    bubble.destroy();
    overlay.remove();
    stage.dispose();
    opts.onDone?.();
    resolveDone();
  };
  let revealing: Promise<void> | null = null;
  const reveal = (fast = false): Promise<void> => {
    if (revealing) return revealing;
    opts.onRevealStart?.();
    const ms = fast ? 220 : TIMING3.exitFade;
    overlay.style.setProperty("--aj-fade", ms + "ms");
    overlay.classList.add("aj-intro3d-out");
    revealing = new Promise<void>((res) => setTimeout(res, ms + 30)).then(cleanup);
    return revealing;
  };
  const doSkip = (): void => {
    if (finished || revealing) return;
    opts.onState?.("SKIPPED");
    overlay.dataset.state = "SKIPPED";
    jacob.freeze();
    lilou.freeze();
    clock.cancel();
    void reveal(true);
  };
  skip.addEventListener("click", doSkip);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") doSkip();
  };
  document.addEventListener("keydown", onKey);

  const hearts = (x: number, y: number): void => {
    for (let i = 0; i < 8; i++) {
      const h = document.createElement("span");
      h.className = "aj-heart";
      h.textContent = "♥";
      h.style.left = x + (Math.random() - 0.5) * 50 + "px";
      h.style.top = y + (Math.random() - 0.5) * 24 + "px";
      h.style.setProperty("--dx", (Math.random() - 0.5) * 60 + "px");
      h.style.setProperty("--s", (0.7 + Math.random() * 0.8).toFixed(2));
      h.style.animationDelay = i * 90 + "ms";
      ui.append(h);
      setTimeout(() => h.remove(), 2300 + i * 90);
    }
  };

  clock.start();
  void (async () => {
    try {
      await runTimeline3D({
        clock,
        stage,
        jacob,
        lilou,
        bubble,
        hearts,
        size: () => ({ w: W, h: H }),
        onState: (s) => {
          overlay.dataset.state = s;
          opts.onState?.(s);
        },
        reveal: () => reveal(false),
      });
    } catch (e) {
      if (!(e instanceof IntroCancelled)) {
        console.warn("intro3d : erreur pendant la séquence, fermeture propre", e);
        void reveal(true);
      }
    }
  })();

  return { overlay, skip: doSkip, stop: cleanup, done, stats: () => ({ tier: stage.tier, fps: fpsAvg, t: clock.t }) };
}
