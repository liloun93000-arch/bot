/**
 * Fiches des personnages. Les sprites viennent des planches HD (marche, vues, poses) et sont
 * DÉJÀ normalisés à la génération : REF_PX pixels = hauteur « sol → sommet de la tête/casquette »
 * pour Jacob comme pour Lilou, pieds au bas de l'image (ligne de sol), ancre x stable.
 * Leur taille à l'écran ne dépend donc JAMAIS des dimensions des fichiers d'origine.
 */

export interface SpriteAsset {
  w: number;
  h: number;
  /** Ancre horizontale (px sprite) : torse pour la marche, milieu des pieds pour les poses debout. */
  ax: number;
  /** Axe du torse / de la tête (px sprite). */
  tx: number;
  /** Milieu des pieds (px sprite). */
  fx: number;
  src: string;
}
export type SpriteSet = Record<string, SpriteAsset>;

export interface CharSpec {
  id: "jacob" | "lilou";
  /** +1 : marche vers la droite, -1 : vers la gauche (les sprites de Lilou sont déjà retournés). */
  faceDir: 1 | -1;
  /** Poses de marche, DANS L'ORDRE du cycle (le pied d'appui recule par rapport au corps). */
  walk: string[];
  /** Longueur d'un cycle de marche (4 poses), en hauteurs de personnage. */
  cycleH: number;
  /** Toutes les poses à précharger. */
  poses: string[];
}

export const JACOB: CharSpec = {
  id: "jacob",
  faceDir: 1,
  walk: ["w1", "w4", "w2", "w3"],
  cycleH: 0.31,
  poses: ["w1", "w2", "w3", "w4", "arr", "q34g", "profd", "p11", "p12", "p13", "p14", "p17"],
};

export const LILOU: CharSpec = {
  id: "lilou",
  faceDir: -1,
  walk: ["w1", "w4", "w2", "w3"],
  cycleH: 0.29,
  poses: ["w1", "w2", "w3", "w4", "arr", "q34d", "p16", "p17"],
};

export const spriteKey = (c: CharSpec, pose: string): string => `${c.id}.${pose}`;
