/**
 * Chargement des modèles 3D de Jacob et de Lilou (maillage allégé + squelette + poids de peau + texture).
 * Format compact (voir maquette-artefact/intro3d-sources/pack.py) : tout est décodé en mémoire, aucun fichier externe.
 */
import * as THREE from "./vendor/three.module.js";
import { MODELS, type PackedModel } from "./models.generated";

export type CharId = "jacob" | "lilou";

export interface LoadedModel {
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bones: Map<string, THREE.Bone>;
  /** Position de repos (monde du modèle) de chaque os. */
  rest: Map<string, THREE.Vector3>;
}

/** Hauteur du modèle, sol → sommet de la tête/casquette (unités de la scène). */
export const MODEL_HEIGHT = 1.903;

async function inflate(b64: string): Promise<ArrayBuffer> {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ds = new DecompressionStream("deflate");
  return new Response(new Blob([bin]).stream().pipeThrough(ds)).arrayBuffer();
}

/** Données décodées d'avance (préchargement pendant la connexion) : plus rien à décoder au démarrage de l'intro. */
interface Decoded {
  buf: ArrayBuffer;
  img: HTMLImageElement;
}
const decoded = new Map<CharId, Promise<Decoded>>();
function decode(id: CharId): Promise<Decoded> {
  let p = decoded.get(id);
  if (!p) {
    const m: PackedModel = MODELS[id];
    p = (async () => {
      const img = new Image();
      img.src = m.tex;
      const [buf] = await Promise.all([inflate(m.mesh), img.decode()]);
      return { buf, img };
    })();
    p.catch(() => decoded.delete(id));
    decoded.set(id, p);
  }
  return p;
}
/** À appeler dès que possible (ex. pendant la saisie des identifiants) : décode maillages et textures en arrière-plan. */
export function preloadModels(): Promise<void> {
  return Promise.all([decode("jacob"), decode("lilou")]).then(() => undefined);
}

function makeTexture(img: HTMLImageElement, maxAniso: number): THREE.Texture {
  const t = new THREE.Texture(img);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(4, maxAniso);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

export async function loadModel(id: CharId, maxAniso = 4): Promise<LoadedModel> {
  const m: PackedModel = MODELS[id];
  const { buf, img } = await decode(id);
  const n = m.n;
  const t = m.t;
  let o = 0;
  const take = (len: number): ArrayBuffer => {
    const s = buf.slice(o, o + len);
    o += len;
    return s;
  };
  const q = new Int16Array(take(n * 6));
  const nor = new Int8Array(take(n * 3));
  const uv = new Uint16Array(take(n * 4));
  const ji = new Uint8Array(take(n * 4));
  const jw = new Uint8Array(take(n * 4));
  const idx = new Uint16Array(take(t * 6));
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = q[i]! / 16384;
  const skinW = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = jw[i * 4]!, b = jw[i * 4 + 1]!, c = jw[i * 4 + 2]!, d = jw[i * 4 + 3]!;
    const s = a + b + c + d || 1;
    skinW[i * 4] = a / s;
    skinW[i * 4 + 1] = b / s;
    skinW[i * 4 + 2] = c / s;
    skinW[i * 4 + 3] = d / s;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3, true));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2, true));
  g.setAttribute("skinIndex", new THREE.BufferAttribute(new Uint16Array(ji), 4));
  g.setAttribute("skinWeight", new THREE.BufferAttribute(skinW, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));

  // Squelette : hiérarchie d'os, positions de repos en repère local du parent.
  const bones = new Map<string, THREE.Bone>();
  const rest = new Map<string, THREE.Vector3>();
  const list: THREE.Bone[] = [];
  for (const b of m.bones) {
    const bone = new THREE.Bone();
    bone.name = b.n;
    bones.set(b.n, bone);
    rest.set(b.n, new THREE.Vector3(b.x, b.y, b.z));
    list.push(bone);
  }
  for (const b of m.bones) {
    const bone = bones.get(b.n)!;
    if (b.p) {
      bones.get(b.p)!.add(bone);
      bone.position.copy(rest.get(b.n)!).sub(rest.get(b.p)!);
    } else bone.position.copy(rest.get(b.n)!);
  }
  const tex = makeTexture(img, maxAniso);
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  const mesh = new THREE.SkinnedMesh(g, mat);
  mesh.add(bones.get("hips")!);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list));
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh, bones, rest };
}

export function disposeModel(m: LoadedModel): void {
  m.mesh.geometry.dispose();
  const mat = m.mesh.material as THREE.MeshLambertMaterial;
  mat.map?.dispose();
  mat.dispose();
  m.mesh.skeleton.dispose();
}
