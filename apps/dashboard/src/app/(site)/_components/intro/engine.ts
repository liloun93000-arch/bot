/**
 * Moteur de l'introduction : assemble décor, marionnettes, bulle, timeline,
 * « Passer », responsive et session. Sans dépendance, sans framework.
 */
import { Bubble } from "./bubble";
import { JACOB, LILOU, type SpriteSet } from "./characters";
import { Clock, IntroCancelled } from "./clock";
import type { IntroState } from "./config";
import { TIMING } from "./config";
import { computeLayout, type Layout } from "./layout";
import { Puppet } from "./puppet";
import { markIntroSeen } from "./session";
import { runTimeline } from "./timeline";

export interface MountOptions {
  assets: SpriteSet;
  /** `fixed` : plein écran sur le site. `contained` : à l'intérieur d'un élément (démo, tests). */
  mode?: "fixed" | "contained";
  container?: HTMLElement;
  /** Appelé au début de la révélation (le site doit alors devenir visible). */
  onRevealStart?: () => void;
  onDone?: () => void;
  onState?: (s: IntroState | "SKIPPED") => void;
  /** false : ne pas mémoriser la lecture dans la session (démo « Rejouer »). */
  remember?: boolean;
}

export interface IntroHandle {
  overlay: HTMLElement;
  skip: () => void;
  stop: () => void;
  done: Promise<void>;
}

export function mountIntro(opts: MountOptions): IntroHandle {
  const mode = opts.mode ?? "fixed";
  const host = opts.container ?? document.body;
  if (opts.remember !== false) markIntroSeen();

  const overlay = document.createElement("div");
  overlay.className = "aj-intro" + (mode === "contained" ? " aj-intro-contained" : "");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Introduction animée ARBI JACOB");
  const stage = document.createElement("div");
  stage.className = "aj-intro-stage";
  const floor = document.createElement("div");
  floor.className = "aj-intro-floor";
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "aj-intro-skip";
  skip.textContent = "Passer";
  skip.setAttribute("aria-label", "Passer l'introduction");
  const glow = document.createElement("div");
  glow.className = "aj-intro-glow";
  overlay.append(glow, floor, stage, skip);
  host.append(overlay);

  const clock = new Clock();
  const jacob = new Puppet(JACOB, opts.assets, 0);
  const lilou = new Puppet(LILOU, opts.assets, 1.7);
  stage.append(lilou.root, jacob.root);
  const bubble = new Bubble(stage);

  let layout: Layout = readLayout();
  function readLayout(): Layout {
    const r = overlay.getBoundingClientRect();
    return computeLayout(Math.max(280, r.width), Math.max(320, r.height));
  }
  function applyLayout(prev?: Layout): void {
    layout = readLayout();
    overlay.style.setProperty("--aj-floor", layout.floorY + "px");
    // Une seule hauteur pour les deux personnages, une seule ligne de sol.
    jacob.setHeight(layout.charH);
    lilou.setHeight(layout.charH);
    jacob.y = lilou.y = layout.floorY;
    if (prev && prev.vw > 0) {
      const k = layout.vw / prev.vw;
      jacob.x *= k;
      lilou.x *= k;
    }
    bubble.place();
  }
  applyLayout();
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => applyLayout(layout)) : null;
  ro?.observe(overlay);

  const offTick = clock.onTick((dt, t) => {
    jacob.update(dt, t);
    lilou.update(dt, t);
    bubble.place();
  });

  // ── Fin / « Passer »
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
    opts.onDone?.();
    resolveDone();
  };
  let revealing: Promise<void> | null = null;
  const reveal = (fast = false): Promise<void> => {
    if (revealing) return revealing;
    opts.onRevealStart?.();
    overlay.classList.add(fast ? "aj-reveal-fast" : "aj-reveal");
    revealing = new Promise<void>((res) => setTimeout(res, fast ? 320 : TIMING.revealMs)).then(cleanup);
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

  // ── Hearts (clin d'œil final)
  const hearts = (x: number, y: number): void => {
    for (let i = 0; i < 7; i++) {
      const h = document.createElement("span");
      h.className = "aj-heart";
      h.textContent = "♥";
      h.style.left = x + (Math.random() - 0.5) * lilou.H * 0.3 + "px";
      h.style.top = y + (Math.random() - 0.5) * lilou.H * 0.1 + "px";
      h.style.setProperty("--dx", (Math.random() - 0.5) * 60 + "px");
      h.style.setProperty("--s", (0.7 + Math.random() * 0.8).toFixed(2));
      h.style.animationDelay = i * 90 + "ms";
      stage.append(h);
      setTimeout(() => h.remove(), 2200 + i * 90);
    }
  };

  // ── Préchargement : TOUTES les poses de Jacob et de Lilou sont décodées AVANT de lancer l'intro.
  const allReady = Promise.all([jacob.preload(), lilou.preload()]);

  void (async () => {
    try {
      await allReady;
      if (clock.cancelled) return;
      clock.start();
      await runTimeline({
        clock,
        layout: () => layout,
        jacob,
        lilou,
        bubble,
        hearts,
        onState: (s) => {
          overlay.dataset.state = s;
          opts.onState?.(s);
        },
        reveal: () => reveal(false),
      });
    } catch (e) {
      if (!(e instanceof IntroCancelled)) {
        // Erreur inattendue : jamais bloquer l'utilisateur.
        void reveal(true);
      }
    }
  })();

  return { overlay, skip: doSkip, stop: cleanup, done };
}
