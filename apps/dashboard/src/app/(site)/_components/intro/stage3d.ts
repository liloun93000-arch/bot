/**
 * Scène 3D : sol, éclairage, ombres, décor, écran « interface », caméra de cinéma.
 */
import * as THREE from "./vendor/three.module.js";
import { QUALITY } from "./config3d";
import { clamp } from "./clock";

export interface Shot {
  /** Point regardé. */
  cx: number;
  cy: number;
  /** Hauteur de monde visible (au plan des personnages) — plus petit = plus proche. */
  h: number;
  /** Largeur de monde minimale à garder visible. */
  w: number;
  /** Orbite horizontale (degrés) et élévation (degrés). */
  az: number;
  el: number;
  /** Profondeur de champ du regard : décalage de la cible en z (0 = plan des personnages). */
  lz: number;
}

export const ease = {
  io: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number): number => 1 - Math.pow(1 - t, 3),
  smooth: (t: number): number => t * t * (3 - 2 * t),
};

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
  readonly renderer: THREE.WebGLRenderer;
  readonly actors = new THREE.Group();
  tier = 0;
  w = 1;
  h = 1;
  aspect = 1;

  private key: THREE.DirectionalLight;
  private shadowFloor: THREE.Mesh;
  private blobs: { m: THREE.Mesh; o: THREE.Object3D }[] = [];
  private blobTex: THREE.Texture;
  private shot: Shot;
  private from: Shot | null = null;
  private to: Shot | null = null;
  private t0 = 0;
  private dur = 0;
  private fn: (t: number) => number = ease.io;
  private tNow = 0;
  private shake = 0;

  constructor(canvas: HTMLCanvasElement, tier: number) {
    this.tier = tier;
    // Fond TRANSPARENT : les personnages sont joués par-dessus le vrai dashboard (rien d'autre dans la scène).
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;
    this.scene.add(this.actors);

    // Lumières : clé chaude, contre-jours (cool à gauche, rosé à droite) pour détacher le noir des vêtements du fond.
    this.scene.add(new THREE.HemisphereLight(0xc4cae6, 0x2a2328, 1.25));
    const key = new THREE.DirectionalLight(0xfff1e6, 2.3);
    key.position.set(2.2, 5.0, 4.4);
    key.target.position.set(0, 0.8, 0);
    key.castShadow = true;
    key.shadow.camera.left = -3.2;
    key.shadow.camera.right = 3.2;
    key.shadow.camera.top = 3.4;
    key.shadow.camera.bottom = -1.6;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 14;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    this.key = key;
    this.scene.add(key, key.target);
    const rimA = new THREE.DirectionalLight(0xa9c0ff, 1.7);
    rimA.position.set(-4.5, 2.8, -3.2);
    const rimB = new THREE.DirectionalLight(0xff8fb8, 1.5);
    rimB.position.set(4.5, 2.8, -3.2);
    this.scene.add(rimA, rimB);

    // Sol invisible qui ne reçoit que l'ombre portée + ombre de contact douce sous chaque personnage.
    this.shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.ShadowMaterial({ opacity: 0.45 }));
    this.shadowFloor.rotation.x = -Math.PI / 2;
    this.shadowFloor.position.y = 0.002;
    this.shadowFloor.receiveShadow = true;
    this.scene.add(this.shadowFloor);
    this.blobTex = blobTexture();

    this.shot = { cx: 0, cy: 1, h: 6, w: 3, az: 0, el: 0, lz: 0 };
    this.applyTier();
  }

  /** Ombre de contact douce qui suit un objet (les pieds ne « flottent » jamais, même sans ombre portée). */
  addBlob(o: THREE.Object3D, size = 1.6): void {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size * 0.62),
      new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false, opacity: 0.9 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.004;
    m.renderOrder = -1;
    this.scene.add(m);
    this.blobs.push({ m, o });
  }

  /** Taille de rendu (px CSS) — appelé à chaque redimensionnement. */
  resize(w: number, h: number): void {
    this.w = Math.max(2, w);
    this.h = Math.max(2, h);
    this.aspect = this.w / this.h;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.w, this.h, false);
  }

  setTier(i: number): void {
    this.tier = clamp(i, 0, QUALITY.length - 1);
    this.applyTier();
  }
  private applyTier(): void {
    const q = QUALITY[this.tier]!;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.setSize(this.w, this.h, false);
    this.key.castShadow = q.shadows;
    this.shadowFloor.visible = q.shadows;
    this.key.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    if (this.key.shadow.map) {
      this.key.shadow.map.dispose();
      this.key.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }

  // ───────── Caméra ─────────
  get currentShot(): Shot {
    return this.shot;
  }
  /** Cadre de référence : un personnage occupe `frac` de la hauteur de l'écran. */
  hFor(frac: number): number {
    return 1.9 / frac;
  }
  cut(s: Shot): void {
    this.shot = { ...s };
    this.from = this.to = null;
  }
  /** Mouvement de caméra (travelling / zoom / orbite) interpolé avec accélération et freinage. */
  moveTo(s: Partial<Shot>, durMs: number, fn: (t: number) => number = ease.io): void {
    this.from = { ...this.shot };
    this.to = { ...this.shot, ...s };
    this.t0 = this.tNow;
    this.dur = Math.max(0.001, durMs / 1000);
    this.fn = fn;
  }
  /** Mise à jour en continu de la cible (suivi d'un personnage) sans réinitialiser un mouvement en cours. */
  track(cx: number, k = 1): void {
    if (this.to) this.to.cx = cx;
    this.shot.cx += (cx - this.shot.cx) * clamp(k, 0, 1);
  }
  private lookNow = new THREE.Vector3(0, 1, 0);
  bump(a = 1): void {
    this.shake = Math.max(this.shake, a);
  }

  private cameraFromShot(s: Shot, out: { p: THREE.Vector3; l: THREE.Vector3 }): void {
    const f = THREE.MathUtils.degToRad(this.camera.fov);
    const tan = Math.tan(f / 2);
    const needH = Math.max(s.h, s.w / this.aspect);
    const dist = needH / (2 * tan);
    const az = THREE.MathUtils.degToRad(s.az);
    const el = THREE.MathUtils.degToRad(s.el);
    out.l.set(s.cx, s.cy, s.lz);
    out.p.set(s.cx + Math.sin(az) * Math.cos(el) * dist, s.cy + Math.sin(el) * dist, s.lz + Math.cos(az) * Math.cos(el) * dist);
  }

  private tmp = { p: new THREE.Vector3(), l: new THREE.Vector3() };

  update(dt: number, t: number): void {
    this.tNow = t;
    if (this.from && this.to) {
      const k = clamp((t - this.t0) / this.dur, 0, 1);
      const e = this.fn(k);
      const a = this.from;
      const b = this.to;
      const m = (p: keyof Shot): number => a[p] + (b[p] - a[p]) * e;
      this.shot = { cx: m("cx"), cy: m("cy"), h: m("h"), w: m("w"), az: m("az"), el: m("el"), lz: m("lz") };
      if (k >= 1) {
        this.shot = { ...b };
        this.from = this.to = null;
      }
    }
    this.cameraFromShot(this.shot, this.tmp);
    this.camera.position.copy(this.tmp.p);
    this.lookNow.copy(this.tmp.l);
    // Léger souffle de caméra (jamais parfaitement immobile) + secousse d'impact.
    const b = Math.sin(t * 0.6) * 0.008 + Math.sin(t * 1.3) * 0.004;
    this.shake *= Math.pow(0.02, dt);
    this.camera.position.x += b + (Math.random() - 0.5) * 0.03 * this.shake;
    this.camera.position.y += Math.sin(t * 0.45) * 0.006 + (Math.random() - 0.5) * 0.03 * this.shake;
    this.camera.lookAt(this.lookNow);
    for (const bl of this.blobs) {
      bl.m.visible = bl.o.visible;
      bl.m.position.x = bl.o.position.x;
      bl.m.position.z = bl.o.position.z + 0.02;
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Projette un point monde vers des pixels CSS (dans le canvas). */
  project(p: THREE.Vector3, out: { x: number; y: number }): { x: number; y: number } {
    const v = p.clone().project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.w;
    out.y = (-v.y * 0.5 + 0.5) * this.h;
    return out;
  }

  dispose(): void {
    this.scene.traverse((o: THREE.Mesh) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.renderer.dispose();
  }
}

// ───────── Textures procédurales ─────────
function blobTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, "rgba(0,0,0,0.75)");
  gr.addColorStop(0.55, "rgba(0,0,0,0.28)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
