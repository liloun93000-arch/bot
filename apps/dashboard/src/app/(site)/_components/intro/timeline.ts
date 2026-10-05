/**
 * Séquence de la scène : une petite machine à états linéaire.
 * Chaque état est une fonction asynchrone ; l'ordre est dans STATES (config.ts).
 */
import type { Bubble } from "./bubble";
import type { Clock } from "./clock";
import { DIALOGUE, STATES, TIMING, readTime, type IntroState } from "./config";
import type { Layout } from "./layout";
import type { Puppet } from "./puppet";

export interface SceneCtx {
  clock: Clock;
  layout: () => Layout;
  jacob: Puppet;
  lilou: Puppet;
  bubble: Bubble;
  hearts: (x: number, y: number) => void;
  onState: (s: IntroState) => void;
  reveal: () => Promise<void>;
}

const sleep = (c: SceneCtx, ms: number) => c.clock.sleep(ms);

/** Zone autorisée pour les bulles : dans l'écran, et jamais sur le visage de Lilou. */
function bounds(c: SceneCtx) {
  const L = c.layout();
  let right = L.vw - L.margin;
  if (c.lilou.visible) {
    const faceLeft = c.lilou.headX() - c.lilou.viewWidth() * 0.42 - 6;
    right = Math.min(right, faceLeft);
  }
  return { left: L.margin, right, top: L.topSafe, maxW: L.bubbleMaxW };
}

/** Une réplique : bulle ancrée au personnage qui parle + machine à écrire, puis lecture et disparition. */
async function say(
  c: SceneCtx,
  text: string,
  msPerChar: number,
  opts: { shout?: boolean; offsetX?: number; hold?: number; keep?: boolean; onChar?: (i: number) => void; who?: Puppet } = {},
): Promise<void> {
  const { bubble } = c;
  const who = opts.who ?? c.jacob;
  who.speak(!opts.shout);
  await bubble.show(
    {
      text,
      shout: opts.shout,
      msPerChar,
      anchor: () => {
        const L = c.layout();
        return { x: who.headX() + (opts.offsetX ?? 0) * L.charH, bottom: L.floorY - L.charH - 8 };
      },
      bounds: () => bounds(c),
      onChar: (ch, i) => {
        if (ch === " " || /[,.!?]/.test(ch)) who.beat(opts.shout ? 1.2 : 0.7);
        opts.onChar?.(i);
      },
    },
    c.clock,
  );
  who.speak(false);
  await sleep(c, opts.hold ?? readTime(text));
  if (!opts.keep) await bubble.hide(c.clock);
}

const HANDLERS: Record<IntroState, (c: SceneCtx) => Promise<void>> = {
  // Jacob entre par la gauche : cycle de marche 1→4 calé sur la distance, accélération puis décélération.
  async ENTER_JACOB(c) {
    const L = c.layout();
    c.jacob.x = L.jacobStartX;
    c.jacob.show("w1");
    await sleep(c, TIMING.startDelay);
    await c.jacob.walkTo(() => c.layout().jacobStopX, TIMING.jacobWalk);
    c.jacob.setPose("w4", 90); // ralenti : 3/4 avant
    await sleep(c, TIMING.pauseAfterJacobStops);
  },

  // Il pivote vers l'utilisateur : 3/4 → face caméra, avec un petit effet d'inertie.
  async JACOB_FACE_USER(c) {
    await c.jacob.turnTo(["arr"], (ms) => sleep(c, ms), 120, 150);
    c.jacob.jump(0.3);
    await sleep(c, TIMING.pauseAfterFacingUser);
  },

  // Gestes calés sur la phrase : mains en avant puis paumes ouvertes sur « la meilleure ».
  async MESSAGE_1(c) {
    const j = c.jacob;
    await say(c, DIALOGUE.message1, TIMING.typeMs, {
      onChar: (i) => {
        if (i === 0) j.setPose("p12", 130);
        if (i === 31) j.setPose("p14", 130);
      },
    });
    j.setPose("arr", 160);
    await sleep(c, TIMING.pauseBetweenBubbles);
  },

  // « Regarde comment on fait » : pose expressive (il montre quelque chose à l'utilisateur).
  async MESSAGE_2(c) {
    const j = c.jacob;
    j.setPose("p13", 120);
    j.setZoom(1.02);
    await say(c, DIALOGUE.message2, TIMING.typeMsMessage2, { hold: 1500 });
    await sleep(c, TIMING.pauseAfterMessage2);
    j.setZoom(1);
    j.setPose("arr", 160);
  },

  // Il détourne l'attention vers la droite (face → 3/4 droit → profil), puis crie « LILOU ! ».
  async CALL_LILOU(c) {
    const j = c.jacob;
    await sleep(c, 250);
    await j.turnTo(["q34g"], (ms) => sleep(c, ms), 260, 140);
    j.setLean(2.5);
    await sleep(c, 420);
    await say(c, DIALOGUE.call, TIMING.typeMsCall, {
      shout: true,
      hold: 1150,
      onChar: (i) => {
        if (i === 0) {
          j.setPose("profd", 90);
          j.shout();
        }
      },
    });
    j.setLean(0);
    j.setPose("q34g", 160);
  },

  // Pause comique, puis Lilou arrive de la droite : même cycle de marche, retourné, à la bonne échelle dès le 1er pixel.
  async ENTER_LILOU(c) {
    await sleep(c, TIMING.pauseBeforeLilou);
    const L = c.layout();
    c.lilou.x = L.lilouStartX;
    c.lilou.show("w1");
    await c.lilou.walkTo(() => c.layout().lilouStopX, TIMING.lilouWalk);
    c.lilou.setPose("w4", 90);
    await sleep(c, TIMING.pauseAfterLilouStops);
    // Elle se tourne vers Jacob (3/4 vers la gauche), pas vers la caméra.
    await c.lilou.turnTo(["q34d"], (ms) => sleep(c, ms), 150, 150);
    c.jacob.jump(0.3);
    await sleep(c, 380);
  },

  // Face à face (3/4 tous les deux) : Jacob lui sort la phrase, Lilou réagit.
  async JACOB_TALKS_TO_LILOU(c) {
    const { lilou, jacob } = c;
    await sleep(c, 200);
    await say(c, DIALOGUE.final, TIMING.typeMsFinal, {
      offsetX: -0.06,
      keep: true,
      hold: 1,
      onChar: (i) => {
        if (i === 6) lilou.setLean(-1.8);
        if (i === 28) lilou.jump(0.2);
        if (i === 44) lilou.beat(0.6);
      },
    });
    // La réplique est finie : Lilou se tourne vers nous, fait « OK », cœurs, Jacob content.
    lilou.setLean(0);
    await lilou.turnTo(["arr"], (ms) => sleep(c, ms), 180, 140);
    lilou.jump(0.6);
    jacob.jump(0.4);
    await sleep(c, 260);
    lilou.setPose("p17", 120);
    c.hearts(lilou.x - lilou.viewWidth() * 0.1, c.layout().floorY - lilou.H * 0.78);
    await sleep(c, TIMING.finalHold);
  },

  async END_INTRO(c) {
    await c.bubble.hide(c.clock);
    await sleep(c, TIMING.endPause);
    await c.reveal();
  },
};

export async function runTimeline(c: SceneCtx): Promise<void> {
  for (const s of STATES) {
    c.onState(s);
    await HANDLERS[s](c);
  }
}
