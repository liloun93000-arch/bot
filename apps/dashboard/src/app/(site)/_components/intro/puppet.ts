/**
 * Personnage animé à partir des poses HD : cycle de marche réel (poses 1→4 synchronisées
 * sur la distance parcourue), poses debout, orientations, gestes, avec ressorts, rebond,
 * respiration et inertie. Ce n'est PAS une image qu'on fait glisser.
 *
 * Repère : l'élément racine est posé sur la ligne de sol, à l'ancre horizontale du personnage.
 * Chaque pose est positionnée pour que son ancre (ax) tombe à x = 0 et sa base (semelles) à y = 0.
 */
import { spriteKey, type CharSpec, type SpriteAsset, type SpriteSet } from "./characters";
import { Spring, clamp } from "./clock";
import { REF_PX } from "./sprites.generated";

interface Layer {
  el: HTMLImageElement;
  a: SpriteAsset;
  op: number;
  target: number;
  /** Durée du fondu (s) ; 0 = bascule immédiate, sans aucun vide. */
  fade: number;
}

function div(cls: string): HTMLElement {
  const e = document.createElement("div");
  e.className = cls;
  return e;
}

export class Puppet {
  readonly root = div("pp");
  x = 0;
  y = 0;
  /** Hauteur commune sol → sommet de la tête (px écran). */
  H = 200;
  pose = "";
  visible = false;

  private shadow = div("pp-shadow");
  private body = div("pp-body");
  private layers = new Map<string, Layer>();
  private lean = new Spring(0, 140, 11);
  private squash = new Spring(0, 260, 12);
  private hop = new Spring(0, 240, 14);
  private gait = new Spring(0, 60, 11);
  private zoom = new Spring(1, 120, 14);
  private phase = 0;
  private walkFrame = -1;
  private talk = 0;
  private talkTarget = 0;
  private talkPhase = 0;
  private tNow = 0;
  private speedNow = 0;
  private vmaxNow = 1;
  private idleSeed: number;
  private walk: null | { target: () => number; vmax: number; t0: number; res: () => void } = null;

  constructor(
    private spec: CharSpec,
    sprites: SpriteSet,
    seed: number,
  ) {
    this.idleSeed = seed;
    this.root.append(this.shadow, this.body);
    this.root.style.opacity = "0";
    for (const name of spec.poses) {
      const a = sprites[spriteKey(spec, name)];
      if (!a) continue;
      const el = document.createElement("img");
      el.className = "pp-img";
      el.alt = "";
      el.draggable = false;
      el.decoding = "sync";
      el.src = a.src;
      el.style.opacity = "0";
      this.body.append(el);
      this.layers.set(name, { el, a, op: 0, target: 0, fade: 0 });
    }
  }

  get faceDir(): number {
    return this.spec.faceDir;
  }
  private get s(): number {
    return this.H / REF_PX;
  }

  /** Décode toutes les poses : plus aucun vide ni clignotement au changement de pose. */
  async preload(): Promise<void> {
    await Promise.all(
      [...this.layers.values()].map(async (l) => {
        try {
          await l.el.decode();
        } catch {
          /* décodé à l'affichage */
        }
      }),
    );
  }

  /** Applique la taille commune. Toutes les poses utilisent la MÊME échelle (H / REF_PX). */
  setHeight(H: number): void {
    this.H = H;
    const s = this.s;
    for (const l of this.layers.values()) {
      l.el.style.width = l.a.w * s + "px";
      l.el.style.height = l.a.h * s + "px";
      l.el.style.left = -l.a.ax * s + "px";
      l.el.style.top = -l.a.h * s + "px";
    }
    this.shadow.style.width = H * 0.6 + "px";
    this.shadow.style.height = H * 0.07 + "px";
    this.shadow.style.left = -H * 0.3 + "px";
    this.shadow.style.top = -H * 0.035 + "px";
  }

  show(pose: string): void {
    this.visible = true;
    this.root.style.opacity = "1";
    this.setPose(pose, 0);
  }
  hide(): void {
    this.visible = false;
    this.root.style.opacity = "0";
  }

  /** Change de pose. `fadeMs` > 0 : fondu enchaîné court (poses debout) ; 0 : bascule nette. */
  setPose(name: string, fadeMs = 0): void {
    if (!this.layers.has(name)) return;
    for (const [n, l] of this.layers) {
      const on = n === name;
      l.target = on ? 1 : 0;
      l.fade = fadeMs / 1000;
      if (!fadeMs) {
        l.op = l.target;
        l.el.style.opacity = String(l.op);
      } else if (on && l.op === 0) {
        l.op = 0.001;
      }
    }
    this.pose = name;
  }

  /** Largeur affichée de la pose courante (px). */
  viewWidth(name = this.pose): number {
    const l = this.layers.get(name);
    return l ? l.a.w * this.s : this.H * 0.4;
  }
  /** Abscisse écran de l'axe du torse / de la tête (pour ancrer les bulles). */
  headX(): number {
    const l = this.layers.get(this.pose);
    return l ? this.x + (l.a.tx - l.a.ax) * this.s : this.x;
  }

  /** Enchaîne des poses (ex. profil → 3/4 → face) avec une petite inertie à chaque étape. */
  async turnTo(path: string[], sleep: (ms: number) => Promise<void>, gap = 150, fade = 110): Promise<void> {
    for (const p of path) {
      if (p === this.pose) continue;
      this.setPose(p, fade);
      this.lean.kick(-this.faceDir * 10);
      this.squash.kick(0.35);
      await sleep(gap);
    }
  }

  // ── Gestes ──
  setLean(deg: number): void {
    this.lean.target = deg;
  }
  setZoom(z: number): void {
    this.zoom.target = z;
  }
  jump(power = 1): void {
    this.hop.kick(-210 * power);
    this.squash.kick(-0.9 * power);
  }
  /** Impulsion de parole : à appeler à chaque mot (très léger). */
  beat(strength = 1): void {
    this.hop.kick(-22 * strength);
    this.squash.kick(0.18 * strength);
    this.lean.kick((Math.sin(this.tNow * 7) > 0 ? 1 : -1) * 4 * strength);
  }
  speak(on: boolean): void {
    this.talkTarget = on ? 1 : 0;
  }
  shout(): void {
    this.lean.kick(this.faceDir * 55);
    this.hop.kick(-120);
    this.squash.kick(-0.7);
  }

  // ── Marche ──
  /** Marche jusqu'à `target()` : poses 1→4 enchaînées au rythme de la distance parcourue. */
  walkTo(target: () => number, speedH: number): Promise<void> {
    return new Promise((res) => {
      this.vmaxNow = speedH * this.H;
      this.walk = { target, vmax: this.vmaxNow, t0: this.tNow, res };
    });
  }
  get walking(): boolean {
    return this.walk !== null;
  }
  freeze(): void {
    if (this.walk) {
      const r = this.walk.res;
      this.walk = null;
      r();
    }
  }

  update(dt: number, t: number): void {
    this.tNow = t;
    let walkingNow = false;
    if (this.walk) {
      const w = this.walk;
      const d = w.target() - this.x;
      const rem = Math.abs(d);
      // Accélération initiale (≈0,5 s) puis décélération progressive à l'approche.
      const ramp = clamp((t - w.t0) / 0.55, 0, 1);
      const slow = clamp(rem / (this.H * 0.85), 0, 1);
      const sp = w.vmax * (0.22 + 0.78 * slow) * (0.3 + 0.7 * ramp * ramp * (3 - 2 * ramp));
      const step = sp * dt;
      this.speedNow = sp;
      walkingNow = true;
      if (rem <= Math.max(step, 0.6)) {
        this.x = w.target();
        const r = w.res;
        this.walk = null;
        walkingNow = false;
        this.speedNow = 0;
        // Arrêt : on termine sur la pose « 3/4 avant » (la dernière du cycle), le corps part un peu en avant.
        this.lean.kick(this.faceDir * 60);
        this.squash.kick(0.8);
        this.walkFrame = -1;
        r();
      } else {
        this.x += Math.sign(d) * step;
        // La phase avance avec la DISTANCE : pas de patinage, et les pas ralentissent avec le corps.
        this.phase += step / (this.spec.cycleH * this.H);
        const n = this.spec.walk.length;
        const f = Math.floor((((this.phase % 1) + 1) % 1) * n);
        if (f !== this.walkFrame) {
          this.walkFrame = f;
          this.setPose(this.spec.walk[f], 0);
        }
      }
    }
    this.gait.target = walkingNow ? clamp(this.speedNow / this.vmaxNow, 0.3, 1) : 0;
    for (const sp of [this.lean, this.squash, this.hop, this.gait, this.zoom]) sp.step(dt);
    this.talk += (this.talkTarget - this.talk) * Math.min(1, dt * 8);
    this.talkPhase += dt * 9;

    const g = clamp(this.gait.x, 0, 1.2);
    const idle = this.idleSeed;
    const ph = ((this.phase % 1) + 1) % 1;
    // Rebond vertical : bas aux poses d'appui (1 et 3 du cycle), haut aux poses de passage.
    const up = 0.5 - 0.5 * Math.cos(4 * Math.PI * (ph - 0.125));
    const bob = -up * this.H * 0.022 * g;
    const breathe = 0.009 * Math.sin((t + idle) * 2.0) + 0.003 * Math.sin((t + idle) * 0.9);
    const sway = (0.5 * Math.sin((t + idle) * 1.05) + 0.25 * Math.sin((t + idle) * 2.3)) * (1 - g);
    const sq = this.squash.x;
    const sx = 1 - sq * 0.4;
    const sy = (1 + breathe + sq * 0.5) * this.zoom.x;
    const hopY = Math.min(0, this.hop.x);
    const nod = this.talk * Math.sin(this.talkPhase) * 0.5;
    const lean = this.lean.x + sway + nod + g * this.faceDir * 1.4;

    this.root.style.transform = `translate3d(${this.x.toFixed(2)}px,${this.y.toFixed(2)}px,0)`;
    this.body.style.transform =
      `translate3d(0,${(bob + hopY).toFixed(2)}px,0) rotate(${lean.toFixed(2)}deg) scale(${(sx * this.zoom.x).toFixed(4)},${sy.toFixed(4)})`;
    const hopK = clamp(1 + hopY / (this.H * 0.4), 0.7, 1);
    this.shadow.style.transform = `scale(${(hopK * (1 - up * 0.05 * g)).toFixed(3)})`;
    this.shadow.style.opacity = (0.6 * hopK).toFixed(3);

    // Fondus enchaînés (uniquement quand fade > 0).
    for (const l of this.layers.values()) {
      if (l.op === l.target) continue;
      l.op = l.fade > 0 ? l.op + Math.sign(l.target - l.op) * Math.min(Math.abs(l.target - l.op), dt / l.fade) : l.target;
      l.el.style.opacity = l.op.toFixed(3);
    }
  }
}
