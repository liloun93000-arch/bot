/**
 * Personnage 3D animé : un modèle → un volume → un squelette → des mouvements continus.
 *
 * - Marche : phase de pas pilotée par la DISTANCE parcourue + cinématique inverse des jambes
 *   → le pied d'appui reste collé au sol (aucun patinage), bassin qui monte/descend/se balance,
 *   buste en contre-rotation, bras en opposition, talon/pointe au contact et à la poussée.
 * - Poses de discussion : ressorts amortis par articulation (anticipation, inertie, dépassement),
 *   jamais d'interpolation linéaire ni de changement brutal.
 * - Repos : respiration, transfert de poids, micro-mouvements de la tête, jamais figé.
 * - Cheveux de Lilou : chaîne de ressorts (mouvement secondaire / follow-through).
 */
import * as THREE from "./vendor/three.module.js";
import { Spring, clamp, smooth } from "./clock";
import type { CharId, LoadedModel } from "./model3d";

const D2R = Math.PI / 180;
type E3 = [number, number, number];
export type PoseName = "rest" | "open" | "fwd" | "palms" | "point" | "hips" | "cheer" | "wave";

/** Mise en miroir d'une rotation (gauche ↔ droite). */
const mir = (e: E3): E3 => [e[0], -e[1], -e[2]];

/** Poses de haut du corps (degrés ; x = avant/arrière, y = torsion, z = écart latéral). */
const POSES: Record<PoseName, Record<string, E3>> = {
  rest: {
    upperarmA: [0, 0, 5], forearmA: [-10, 0, 0],
    upperarmB: mir([0, 0, 5]), forearmB: [-10, 0, 0],
  },
  open: {
    upperarmA: [-30, -8, 9], forearmA: [-62, -20, 0], handA: [0, -14, 0],
    upperarmB: mir([-30, -8, 9]), forearmB: [-62, 20, 0], handB: [0, 14, 0],
    chest: [-1, 0, 0], head: [-2, 0, 0],
  },
  fwd: {
    upperarmA: [-38, 0, 8], forearmA: [-48, 0, 0],
    upperarmB: [-44, 0, -6], forearmB: [-56, 0, 0],
    chest: [1, 0, 0], head: [1, 0, 0],
  },
  palms: {
    upperarmA: [-34, -14, 12], forearmA: [-74, -28, 0], handA: [0, -20, 0],
    upperarmB: mir([-34, -14, 12]), forearmB: [-74, 28, 0], handB: [0, 20, 0],
    head: [0, 0, 3],
  },
  point: {
    upperarmB: [-78, 6, -5], forearmB: [-6, 0, 0], handB: [0, 0, 0],
    upperarmA: [4, 0, 8], forearmA: [-16, 0, 0],
    chest: [0, -5, 0], head: [-2, 4, 0],
  },
  hips: {
    upperarmA: [-6, 0, 9], forearmA: [-42, -10, 0], handA: [0, -8, 0],
    upperarmB: mir([-6, 0, 9]), forearmB: [-42, 10, 0], handB: [0, 8, 0],
    chest: [-1, 0, 0],
  },
  cheer: {
    upperarmA: [-52, 0, 16], forearmA: [-62, 0, 4],
    upperarmB: mir([-52, 0, 16]), forearmB: [-62, 0, -4],
    head: [-5, 0, 0], chest: [-3, 0, 0],
  },
  wave: {
    upperarmA: [-8, 0, 8], forearmA: [-14, 0, 0],
    upperarmB: [-30, 0, -14], forearmB: [-100, 0, 6], handB: [0, 0, 0],
    head: [0, -4, -3],
  },
};

const DRIVEN = ["spine", "chest", "neck", "head", "upperarmA", "forearmA", "handA", "upperarmB", "forearmB", "handB"];

// Géométrie des jambes (unités du modèle)
const L1 = 0.32; // cuisse
const L2 = 0.2; // tibia
const ANKLE_H = 0.132; // hauteur de la cheville au sol
const HIPS_H = 0.652; // hauteur du bassin au repos
const FOOT_X = 0.16;

export interface CharOptions {
  /** Longueur d'un cycle de marche (2 pas) en unités du modèle. */
  cycle: number;
  seed: number;
}

export class Character {
  readonly group = new THREE.Group();
  readonly id: CharId;
  readonly model: LoadedModel;
  /** Échelle modèle → monde (même valeur pour les deux personnages : échelle commune). */
  readonly s: number;

  private b: Record<string, THREE.Bone> = {};
  private pose: PoseName = "rest";
  private poseSp = new Map<string, [Spring, Spring, Spring]>();
  private yawS = new Spring(0, 46, 11.5);
  private yawTarget = 0;
  private lookYaw = new Spring(0, 60, 12);
  private lookPitch = new Spring(0, 60, 12);
  private beatS = new Spring(0, 220, 11);
  private gest = new Spring(0, 90, 13);
  private gestSide = 1;
  private gestOn = 0;
  private nextGest = 1.1;
  private shiftS = new Spring(0, 28, 7);
  private nodS = new Spring(0, 160, 12);
  private talk = 0;
  private talkTarget = 0;
  private t = 0;
  private seed: number;
  private cycle: number;

  // Marche
  private phase = 0;
  private ww = 0;
  private speed = 0;
  private lastSpeed = 0;
  private accel = 0;
  private walked = 0;
  private job: null | { target: number; vmax: number; t0: number; start: number; res: () => void; exit: boolean } = null;

  // Saut
  private hop = { y: 0, v: 0, air: false, crouch: 0, queued: 0 };
  private landKick = new Spring(0, 260, 13);

  // Cheveux
  private hair: { th: number; om: number; ro: number; rw: number }[] = [];
  private hairBones: THREE.Bone[] = [];
  private lastYaw = 0;
  private yawRate = 0;

  constructor(id: CharId, model: LoadedModel, scale: number, opts: CharOptions) {
    this.id = id;
    this.model = model;
    this.s = scale;
    this.seed = opts.seed;
    this.cycle = opts.cycle;
    model.root.scale.setScalar(scale);
    this.group.add(model.root);
    for (const [n, bone] of model.bones) this.b[n] = bone;
    for (const n of DRIVEN) this.poseSp.set(n, [new Spring(0, 70, 15), new Spring(0, 70, 15), new Spring(0, 70, 15)]);
    for (let i = 1; i <= 3; i++) {
      const hb = model.bones.get("hair" + i);
      if (hb) {
        this.hairBones.push(hb);
        this.hair.push({ th: 0, om: 0, ro: 0, rw: 0 });
      }
    }
    this.setPose("rest", true);
  }

  // ───────── API de mise en scène ─────────
  get x(): number {
    return this.group.position.x;
  }
  set x(v: number) {
    this.group.position.x = v;
  }
  get walking(): boolean {
    return this.job !== null;
  }

  /** Orientation du corps (0 = face caméra, +90° = vers la droite de l'écran). `snap` : sans transition. */
  faceTo(deg: number, snap = false): void {
    this.yawTarget = deg;
    if (snap) {
      this.yawS.x = deg;
      this.yawS.v = 0;
      this.yawS.target = deg;
    } else this.yawS.target = deg;
  }
  /** Regard (relatif au corps), partagé entre tête, cou et buste. */
  look(yawDeg: number, pitchDeg = 0): void {
    this.lookYaw.target = yawDeg;
    this.lookPitch.target = pitchDeg;
  }
  setPose(p: PoseName, instant = false): void {
    this.pose = p;
    if (instant) this.applyPose(true);
  }
  speak(on: boolean): void {
    this.talkTarget = on ? 1 : 0;
  }
  /** Accent de parole : très léger mouvement du buste et de la tête (jamais des bras qui moulinent). */
  beat(strength = 1): void {
    this.beatS.kick(-5 * strength);
  }
  /** Réaction d'écoute : hochement de tête discret + petit changement d'appui. */
  react(strength = 1): void {
    this.nodS.kick(-5 * strength);
    this.shiftS.target = (this.shiftS.target >= 0 ? -1 : 1) * 1.1;
  }
  /** Geste de la main qui accompagne la parole (un bras, avant-bras vers l'avant), puis retour au repos. */
  gesture(side: 1 | -1 = 1): void {
    this.gestSide = side;
    this.gestOn = 0.7;
  }
  /** Saut avec anticipation (flexion), envol et réception. */
  jump(height = 0.22): void {
    this.hop.queued = height;
    this.hop.crouch = 0.16;
  }
  shout(): void {
    this.beatS.kick(-12);
    this.landKick.kick(-0.9);
  }

  /** Marche jusqu'à l'abscisse monde `x` (accélération, croisière, décélération, arrêt posé). */
  walkTo(x: number, vmax: number, exit = false): Promise<void> {
    return new Promise((res) => {
      const dir = Math.sign(x - this.x) || 1;
      this.faceTo(dir * 90);
      this.job = { target: x, vmax, t0: this.t, start: this.x, res, exit };
    });
  }
  freeze(): void {
    if (this.job) {
      const r = this.job.res;
      this.job = null;
      r();
    }
  }

  /** Point au-dessus de la tête (monde), pour ancrer les bulles. */
  headTop(out: THREE.Vector3): THREE.Vector3 {
    this.b.head!.getWorldPosition(out);
    out.y += 0.4 * this.s;
    return out;
  }
  headCenter(out: THREE.Vector3): THREE.Vector3 {
    this.b.head!.getWorldPosition(out);
    out.y += 0.2 * this.s;
    return out;
  }

  // ───────── Mise à jour ─────────
  private applyPose(instant: boolean): void {
    const def = POSES[this.pose];
    for (const n of DRIVEN) {
      const e = def[n] ?? POSES.rest[n] ?? [0, 0, 0];
      const sp = this.poseSp.get(n)!;
      for (let k = 0; k < 3; k++) {
        sp[k]!.target = e[k]! * 1;
        if (instant) {
          sp[k]!.x = e[k]!;
          sp[k]!.v = 0;
        }
      }
    }
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.t += dt;
    const t = this.t + this.seed;
    this.applyPose(false);
    for (const sp of this.poseSp.values()) for (const s of sp) s.step(dt);
    this.yawS.step(dt);
    this.lookYaw.step(dt);
    this.lookPitch.step(dt);
    this.beatS.step(dt);
    this.landKick.step(dt);
    this.gest.step(dt);
    this.shiftS.step(dt);
    this.nodS.step(dt);
    this.talk += (this.talkTarget - this.talk) * Math.min(1, dt * 7);

    // Geste naturel pendant qu'il parle : de temps en temps, une main (jamais en marchant), puis retour au repos.
    if (this.talkTarget > 0 && !this.job) {
      this.nextGest -= dt;
      if (this.nextGest <= 0) {
        this.gesture(Math.sin(this.t * 12.9 + this.seed * 7) > 0 ? 1 : -1);
        this.nextGest = 1.6 + 1.2 * (0.5 + 0.5 * Math.sin(this.t * 5.3 + this.seed));
      }
    }
    if (this.gestOn > 0) this.gestOn -= dt;
    this.gest.target = this.gestOn > 0 ? 1 : 0;
    if (!this.talkTarget && this.t > 0) this.shiftS.target += (Math.sin(this.t * 0.37 + this.seed * 3) * 0.9 - this.shiftS.target) * Math.min(1, dt * 0.6);

    // ── Déplacement + vitesse
    let ds = 0;
    const heading = this.yawS.x * D2R;
    if (this.job) {
      const j = this.job;
      const dir = Math.sign(j.target - j.start) || 1;
      const R = (j.target - this.x) * dir;
      const aligned = clamp(1 - (Math.abs(this.yawS.x - dir * 90) - 8) / 40, 0, 1);
      const ramp = smooth((this.t - j.t0) / 0.75);
      const f = j.exit ? 1 : clamp(R / (1.15 * this.s), 0, 1);
      const v = j.vmax * this.s * ramp * Math.max(0.16, Math.pow(f, 0.7)) * aligned;
      ds = v * dt;
      if (R <= ds + 1e-4) {
        this.x = j.target;
        ds = Math.max(0, R);
        this.job = null;
        if (!j.exit) {
          this.landKick.kick(0.9);
          this.beatS.kick(3);
        }
        j.res();
      } else this.x += dir * ds;
      this.walked = Math.abs(this.x - j.start);
    }
    this.speed = ds / dt;
    this.accel = (this.speed - this.lastSpeed) / dt;
    this.lastSpeed = this.speed;
    this.phase += ds / this.s / this.cycle;
    const Rleft = this.job ? Math.abs(this.job.target - this.x) / this.s : 0;
    const wwT = this.job ? smooth(this.walked / this.s / 0.3) * (this.job.exit ? 1 : smooth(Rleft / 0.55)) : 0;
    this.ww += (wwT - this.ww) * Math.min(1, dt * (this.job ? 30 : 9));
    const ww = this.ww;

    // ── Rotation du corps (+ conduite de la tête et du buste : le regard précède le corps)
    const lead = clamp(wrap(this.yawS.target - this.yawS.x), -70, 70);
    this.group.rotation.y = this.yawS.x * D2R;
    void heading;
    this.yawRate = (this.yawS.x - this.lastYaw) / dt;
    this.lastYaw = this.yawS.x;

    // ── Saut
    const h = this.hop;
    let crouchDy = 0;
    if (h.crouch > 0) {
      h.crouch -= dt;
      crouchDy = -0.075 * smooth(1 - h.crouch / 0.16);
      if (h.crouch <= 0 && h.queued > 0) {
        h.v = Math.sqrt(2 * 9.8 * h.queued * this.s);
        h.air = true;
        h.queued = 0;
      }
    }
    if (h.air) {
      h.v -= 9.8 * this.s * dt;
      h.y += h.v * dt;
      if (h.y <= 0) {
        h.y = 0;
        h.air = false;
        this.landKick.kick(-1.3);
      }
    }
    this.group.position.y = h.y;
    const tuck = h.air ? clamp(h.y / (0.1 * this.s), 0, 1) : 0;

    // ── Couche procédurale (repos, respiration, parole)
    const br = Math.sin(t * 1.9);
    const sway = Math.sin(t * 0.63);
    const talk = this.talk;
    const nod = talk * (1.5 * Math.sin(t * 8.5) + 1.0 * Math.sin(t * 13.1 + 1));
    const beat = this.beatS.x;
    const lk = this.landKick.x;
    const idleAmt = 1 - ww * 0.7;

    const ang = (name: string, extra: E3): E3 => {
      const sp = this.poseSp.get(name);
      return sp ? [sp[0]!.x + extra[0], sp[1]!.x + extra[1], sp[2]!.x + extra[2]] : extra;
    };
    const set = (name: string, e: E3): void => {
      const bone = this.b[name];
      if (bone) bone.rotation.set(e[0] * D2R, e[1] * D2R, e[2] * D2R);
    };

    // Marche : phases des deux pieds, bras, bassin
    const ph = ((this.phase % 1) + 1) % 1;
    const tau = 0.62;
    const C = this.cycle;
    const legA = footTraj(ph, tau, C);
    const legB = footTraj((ph + 0.5) % 1, tau, C);
    const fA = (legA.z / (C * tau * 0.5)) * ww; // +1 jambe gauche en avant
    const fB = (legB.z / (C * tau * 0.5)) * ww;
    const swingAmp = 24;
    const speedF = clamp(this.speed / (0.95 * this.s), 0, 1.2);
    const lean = ww * (3.2 * speedF) + clamp(this.accel * 0.8, -3, 3) * ww;

    // Bassin
    const bobBase = -0.014 + 0.003 * br * idleAmt;
    const bob = ww * (-0.012 + 0.02 * Math.cos(4 * Math.PI * (ph - 0.31)));
    const hipDy = bobBase + bob + crouchDy - tuck * 0.0 - lk * 0.012;
    const hipDx = ww * 0.022 * Math.cos(2 * Math.PI * (ph - 0.31)) + 0.006 * Math.sin(t * 0.5) * idleAmt;
    const hips = this.b.hips!;
    hips.position.set(this.model.rest.get("hips")!.x + hipDx, HIPS_H + hipDy, this.model.rest.get("hips")!.z);
    const twist = 5.2 * -(fA - fB) * 0.5;
    const shift = this.shiftS.x * (1 - ww);
    hips.rotation.set(0, twist * D2R, (-hipDx * 28 + 0.7 * sway * idleAmt + shift) * D2R);

    // Colonne / buste / cou / tête
    set("spine", ang("spine", [lean + 0.5 * br * idleAmt + beat * 0.12 - lk * 1.2, -twist * 0.9 + lead * 0.1, 0.6 * sway * idleAmt - shift * 0.8]));
    set("chest", ang("chest", [0.9 * br * idleAmt + beat * 0.15, -twist * 0.8 + lead * 0.2 + this.lookYaw.x * 0.18, 0.5 * Math.sin(t * 0.41) * idleAmt]));
    set("neck", ang("neck", [this.lookPitch.x * 0.25, this.lookYaw.x * 0.27 + lead * 0.15, 0]));
    set(
      "head",
      ang("head", [
        this.lookPitch.x * 0.5 + nod * 0.5 + this.nodS.x + 1.2 * Math.sin(t * 0.53) * idleAmt + beat * 0.1 - ww * lean * 0.6 + lk * 1.4,
        this.lookYaw.x * 0.55 + lead * 0.45 + 2.2 * Math.sin(t * 0.37) * idleAmt + twist * 0.5 + nod * 0.4,
        1.0 * Math.sin(t * 0.71) * idleAmt,
      ]),
    );

    // Bras : pose + balancier de marche en opposition + accents de parole
    const arms = (side: "A" | "B", f: number): void => {
      const m = side === "A" ? 1 : -1;
      const sw = f * swingAmp;
      const g = this.gestSide === m ? this.gest.x * (1 - ww) : 0;
      set("upperarm" + side, ang("upperarm" + side, [sw + beat * 0.3 + 0.6 * br * idleAmt - 18 * g, 0, m * (0.4 * talk * Math.sin(t * 3.1 + (m > 0 ? 0 : 2)) + 3 * g)]));
      set("forearm" + side, ang("forearm" + side, [-ww * (10 + 8 * Math.max(0, -f)) + beat * 0.4 - 38 * g, m * -10 * g, this.pose === "wave" && side === "B" ? 16 * Math.sin(t * 9) : 0]));
      set("hand" + side, ang("hand" + side, [ww * -4 * f - 6 * g, m * -12 * g, 0]));
    };
    arms("A", fA);
    arms("B", fB);

    // Jambes (IK)
    const legs: Array<["A" | "B", ReturnType<typeof footTraj>, number]> = [["A", legA, 1], ["B", legB, -1]];
    for (const [side, L, m] of legs) {
      const zt = L.z * ww;
      const lift = L.lift * ww + tuck * 0.12 + Math.max(0, L.heel) * 0.03 * ww;
      const ik = solveLeg(zt, ANKLE_H + lift - 0, HIPS_H + hipDy);
      const roll = (-hipDx / 0.55) * 0.9;
      const thigh = this.b["thigh" + side]!;
      const shin = this.b["shin" + side]!;
      const foot = this.b["foot" + side]!;
      const footPitch = ww * L.pitch + tuck * 0.5;
      thigh.rotation.set(ik.a, 0, roll + m * 0.012);
      shin.rotation.set(ik.k, 0, 0);
      foot.rotation.set(footPitch - ik.b, 0, -roll);
    }

    // Cheveux : ressorts en chaîne (follow-through)
    if (this.hairBones.length) {
      const vf = this.speed / this.s; // vitesse vers l'avant (marche)
      const dirSign = this.job ? Math.sign(this.job.target - this.job.start) : 0;
      void dirSign;
      let parentOm = 0;
      for (let i = 0; i < this.hair.length; i++) {
        const H = this.hair[i]!;
        const k = 55 - i * 10;
        const c = 5.0 + i * 0.6;
        const headRate = (this.yawRate * D2R) * 0.4;
        const targ = vf * (0.07 + i * 0.045) + (ww ? 0.02 * Math.sin(ph * Math.PI * 4) : 0);
        const drive = -this.accel / this.s * (0.05 + i * 0.03) + parentOm * 0.35 + beat * 0.015 - lk * 0.12;
        const a = -k * (H.th - targ) - c * H.om + drive * 30 * 0.2;
        H.om += a * dt;
        H.th += H.om * dt;
        const kr = 45 - i * 8;
        const rt = clamp(-headRate * 0.45, -0.5, 0.5);
        const ar = -kr * (H.ro - rt) - (4.5 + i * 0.5) * H.rw;
        H.rw += ar * dt;
        H.ro += H.rw * dt;
        parentOm = H.om;
        const bone = this.hairBones[i]!;
        bone.rotation.set(clamp(H.th, -0.6, 0.6) + (i === 0 ? 0 : 0), 0, clamp(H.ro, -0.5, 0.5) * (1 + i * 0.3) + 0.02 * Math.sin(t * 1.3 + i));
      }
    }
  }
}

const wrap = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;

/** Trajectoire d'un pied par rapport au bassin : appui verrouillé (recule exactement comme avance le corps), puis pas. */
function footTraj(u: number, tau: number, C: number): { z: number; lift: number; pitch: number; heel: number } {
  const half = (C * tau) / 2;
  if (u < tau) {
    const z = half - C * u;
    // Poussée : talon qui se lève en fin d'appui
    const toe = smooth((u - tau * 0.72) / (tau * 0.28));
    const strike = 1 - smooth(u / (tau * 0.14));
    return { z, lift: 0.045 * toe, pitch: 0.5 * toe - 0.18 * strike, heel: toe };
  }
  const w = (u - tau) / (1 - tau);
  const e = w * w * (3 - 2 * w);
  const z = -half + 2 * half * e;
  const lift = 0.13 * Math.sin(Math.PI * Math.pow(w, 0.85));
  const pitch = 0.5 * (1 - smooth(w / 0.35)) - 0.3 * smooth((w - 0.6) / 0.4);
  return { z, lift, pitch, heel: 0 };
}

/** Cinématique inverse à 2 segments dans le plan sagittal (z avant, y haut). */
function solveLeg(az: number, ay: number, hy: number): { a: number; k: number; b: number } {
  const vz = az;
  const vy = ay - hy;
  let d = Math.hypot(vz, vy);
  d = clamp(d, 0.14, L1 + L2 - 0.002);
  const del = Math.atan2(-vz, -vy);
  const cg = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const gam = Math.acos(cg);
  const a = del - gam; // genou vers l'avant
  const kz = -Math.sin(a) * L1;
  const ky = -Math.cos(a) * L1;
  const b = Math.atan2(-(az - kz), -(ay - hy - ky));
  return { a, k: b - a, b };
}
