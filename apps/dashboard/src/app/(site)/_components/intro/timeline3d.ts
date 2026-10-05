/**
 * Mise en scène 3D PAR-DESSUS LE VRAI DASHBOARD : même scénario et mêmes dialogues, rythme condensé (25–30 s),
 * répliques enchaînées sans temps mort, réactions simultanées, sortie des personnages puis fondu : le dashboard est déjà là.
 */
import * as THREE from "./vendor/three.module.js";
import type { Bubble } from "./bubble";
import type { Character } from "./character3d";
import type { Clock } from "./clock";
import { DIALOGUE, STATES, type IntroState } from "./config";
import { FRAMING, TIMING3, WALK } from "./config3d";
import { ease, type Shot, type Stage } from "./stage3d";

export interface Scene3DCtx {
  clock: Clock;
  stage: Stage;
  jacob: Character;
  lilou: Character;
  bubble: Bubble;
  hearts: (x: number, y: number) => void;
  size: () => { w: number; h: number };
  onState: (s: IntroState) => void;
  /** Fin de l'intro : fondu (le dashboard déjà chargé en dessous reste tel quel). */
  reveal: () => Promise<void>;
}

const sleep3 = (c: Scene3DCtx, ms: number) => c.clock.sleep(ms);
const V = new THREE.Vector3();
const P = { x: 0, y: 0 };

/** Positions des deux personnages : plus rapprochés sur écran étroit (même échelle, jamais redimensionnés séparément). */
function spots(c: Scene3DCtx): { jx: number; lx: number } {
  const sep = c.stage.aspect < 0.75 ? 1.45 : c.stage.aspect < 1.2 ? 1.7 : 2.0;
  return { jx: -sep / 2, lx: sep / 2 };
}
const fracWide = (c: Scene3DCtx): number => (c.stage.aspect < 1 ? FRAMING.portrait : FRAMING.landscape);
/** Cadre : `h` = hauteur de monde visible ; `g` = part de l'écran sous les pieds. */
function mk(cx: number, h: number, g: number, w: number, az = 0, el = 0): Shot {
  return { cx, cy: h * (0.5 - g), h, w, az, el, lz: 0 };
}

/** Bulle ancrée à la tête du personnage qui parle (projetée à chaque image). */
function anchorOf(c: Scene3DCtx, ch: Character, dx = 0): { x: number; bottom: number } {
  ch.headTop(V);
  c.stage.project(V, P);
  return { x: P.x + dx, bottom: P.y - 6 };
}
/** Hauteur d'un personnage à l'écran (px), pour éviter son visage. */
function bounds3(c: Scene3DCtx) {
  const { w } = c.size();
  const margin = w < 360 ? 10 : 14;
  let right = w - margin;
  if (c.lilou.group.visible && c.lilou.x < 6) {
    c.lilou.headTop(V);
    c.stage.project(V, P);
    const top = P.y;
    V.set(c.lilou.x, 0, 0);
    c.stage.project(V, P);
    const hpx = Math.max(60, P.y - top);
    c.lilou.headTop(V);
    c.stage.project(V, P);
    right = Math.min(right, P.x - hpx * 0.2 - 4);
  }
  return { left: margin, right, top: 54, maxW: Math.round(Math.min(300, w - margin * 2)) };
}

async function say3(
  c: Scene3DCtx,
  text: string,
  msPerChar: number,
  opts: { shout?: boolean; dx?: number; hold?: number; keep?: boolean; onChar?: (i: number) => void; who?: Character } = {},
): Promise<void> {
  const who = opts.who ?? c.jacob;
  who.speak(!opts.shout);
  await c.bubble.show(
    {
      text,
      shout: opts.shout,
      msPerChar,
      anchor: () => anchorOf(c, who, opts.dx ?? 0),
      bounds: () => bounds3(c),
      onChar: (ch, i) => {
        if (/[,.!?]/.test(ch)) who.beat(opts.shout ? 1.6 : 0.5);
        opts.onChar?.(i);
      },
    },
    c.clock,
  );
  who.speak(false);
  await sleep3(c, opts.hold ?? TIMING3.holdAfterText);
  if (!opts.keep) await c.bubble.hide(c.clock);
}

/** Largeur de monde minimale à garder visible : les deux personnages + marges. */
const wFor = (c: Scene3DCtx): number => spots(c).lx * 2 + 1.4;

const HANDLERS3: Record<IntroState, (c: Scene3DCtx) => Promise<void>> = {
  // Jacob entre par la gauche et marche jusqu'à son point (pieds posés, bassin, bras opposés, arrêt absorbé).
  async ENTER_JACOB(c) {
    const { stage, jacob, lilou } = c;
    const sp = spots(c);
    lilou.group.visible = false;
    lilou.x = 9;
    const hW = stage.hFor(fracWide(c));
    stage.cut(mk(sp.jx * 0.5, hW, 0.1, wFor(c), -6, 1));
    const sh = stage.currentShot;
    jacob.x = sh.cx - Math.max(sh.h * stage.aspect, sh.w) / 2 - 1.0;
    jacob.faceTo(90, true);
    jacob.setPose("rest", true);
    await sleep3(c, TIMING3.startDelay);
    const walk = jacob.walkTo(sp.jx, WALK.jacob);
    stage.moveTo(mk(sp.jx * 0.7, hW * 0.93, 0.1, wFor(c) * 0.9, -2, 1), 2400, ease.io);
    await walk;
  },

  // Il se tourne vers l'utilisateur : le regard part en premier, puis les épaules, puis le corps (inertie).
  async JACOB_FACE_USER(c) {
    const { stage, jacob } = c;
    const sp = spots(c);
    jacob.look(0, 1);
    jacob.faceTo(0);
    stage.moveTo(mk(sp.jx * 0.85, stage.hFor(fracWide(c) * 1.12), 0.09, 1.7, 0, 1), 1100, ease.io);
    await sleep3(c, 800);
  },

  // Gestes calés sur les mots : mains en avant sur « n'oublie pas de dire », paumes ouvertes sur « la meilleure ».
  async MESSAGE_1(c) {
    const j = c.jacob;
    const k = DIALOGUE.message1.indexOf("la meilleure");
    await say3(c, DIALOGUE.message1, TIMING3.typeMs, {
      hold: TIMING3.holdAfterText,
      onChar: (i) => {
        if (i === 9) j.setPose("fwd");
        if (i === k) j.setPose("palms");
      },
    });
    j.setPose("rest");
  },

  // « Regarde comment on fait » : il pointe vers nous, la caméra se rapproche légèrement.
  async MESSAGE_2(c) {
    const { stage, jacob } = c;
    const sp = spots(c);
    jacob.setPose("point");
    stage.moveTo(mk(sp.jx * 0.9, stage.hFor(fracWide(c) * 1.2), 0.08, 1.6, 4, 1), 1300, ease.io);
    await say3(c, DIALOGUE.message2, TIMING3.typeMsShort, { hold: TIMING3.holdAfterShort });
    jacob.setPose("rest");
  },

  // Le regard part d'abord vers la droite, puis les épaules et le corps, la caméra s'ouvre, puis « LILOU ! ».
  async CALL_LILOU(c) {
    const { stage, jacob } = c;
    const sp = spots(c);
    jacob.look(30, 1);
    jacob.faceTo(58);
    stage.moveTo(mk(0, stage.hFor(fracWide(c)) * 0.97, 0.1, wFor(c), 0, 1), 1200, ease.io);
    await sleep3(c, 380);
    await say3(c, DIALOGUE.call, TIMING3.typeMsCall, {
      shout: true,
      hold: TIMING3.holdAfterCall,
      onChar: (i) => {
        if (i === 0) {
          jacob.shout();
          stage.bump(0.45);
        }
      },
    });
    jacob.look(8, 0);
    void sp;
  },

  // Lilou répond tout de suite : elle entre par la droite, même marche, même échelle, même sol ; Jacob la regarde arriver.
  async ENTER_LILOU(c) {
    const { stage, jacob, lilou } = c;
    const sp = spots(c);
    const sh = stage.currentShot;
    lilou.x = sh.cx + Math.max(sh.h * stage.aspect, sh.w) / 2 + 1.0;
    lilou.faceTo(-90, true);
    lilou.setPose("rest", true);
    lilou.group.visible = true;
    const walk = lilou.walkTo(sp.lx, WALK.lilou);
    stage.moveTo(mk(0, stage.hFor(fracWide(c)), 0.1, wFor(c), 2, 1), 2300, ease.io);
    await sleep3(c, 700);
    jacob.look(26, 0);
    await walk;
    // Elle s'arrête, se tourne vers Jacob ; lui se tourne vers elle : ils se regardent, pas la caméra.
    lilou.faceTo(-50);
    lilou.look(0, 0);
    jacob.faceTo(50);
    jacob.look(0, 0);
    jacob.react(0.8);
  },

  // Face à face : Jacob sort la phrase pendant que Lilou l'écoute (regard, hochement, appui) ; réaction à la fin.
  async JACOB_TALKS_TO_LILOU(c) {
    const { stage, jacob, lilou } = c;
    stage.moveTo(mk(0, stage.hFor(fracWide(c) * 1.04), 0.09, wFor(c), 0, 1), 3000, ease.io);
    const a = DIALOGUE.final.indexOf("je sais pas");
    const b = DIALOGUE.final.indexOf("sans toi");
    lilou.look(-6, 0);
    await say3(c, DIALOGUE.final, TIMING3.typeMsFinal, {
      dx: -4,
      keep: true,
      hold: TIMING3.holdAfterFinal,
      onChar: (i) => {
        if (i === 6) jacob.setPose("open");
        if (i === 18) lilou.react(1);
        if (i === a) jacob.setPose("rest");
        if (i === b) jacob.gesture(-1);
        if (i === DIALOGUE.final.length - 4) lilou.react(0.7);
      },
    });
    // Réaction : Lilou se tourne vers nous, bras levés, cœurs ; Jacob content, mains sur les hanches.
    await c.bubble.hide(c.clock);
    jacob.faceTo(24);
    lilou.faceTo(-6);
    lilou.look(0, 0);
    lilou.setPose("cheer");
    jacob.setPose("hips");
    jacob.react(1);
    lilou.headTop(V);
    stage.project(V, P);
    c.hearts(P.x, P.y + 30);
    await sleep3(c, TIMING3.reaction);
  },

  // Salut final vers l'utilisateur, puis les deux repartent chacun de leur côté pendant que l'intro s'efface :
  // le dashboard, déjà chargé en dessous, est directement utilisable.
  async END_INTRO(c) {
    const { stage, jacob, lilou } = c;
    jacob.setPose("rest");
    lilou.setPose("wave");
    jacob.faceTo(0);
    lilou.faceTo(0);
    jacob.look(0, 0);
    jacob.react(1);
    await sleep3(c, 1600);
    lilou.setPose("rest");
    const sh = stage.currentShot;
    const half = Math.max(sh.h * stage.aspect, sh.w) / 2;
    const wj = jacob.walkTo(sh.cx - half - 1.2, WALK.jacob, true);
    const wl = lilou.walkTo(sh.cx + half + 1.2, WALK.lilou, true);
    await sleep3(c, 550);
    const rv = c.reveal();
    await Promise.all([wj, wl, rv]);
  },
};

export async function runTimeline3D(c: Scene3DCtx): Promise<void> {
  for (const s of STATES) {
    c.onState(s);
    await HANDLERS3[s](c);
  }
}
