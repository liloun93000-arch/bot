/**
 * Réglages de l'intro 3D. UNE seule hauteur de personnage pour Jacob et Lilou (échelle commune).
 */
export const CHARACTER_HEIGHT_3D = {
  /** Multiplicateur global : agrandit/réduit les DEUX personnages ensemble (1 = hauteur réelle du modèle ≈ 1,9). */
  scale: 1,
};

/** Cadrage : part de la hauteur d'écran occupée par un personnage en plan large (téléphone / paysage). */
export const FRAMING = { portrait: 0.38, landscape: 0.5 };

/** Niveaux de qualité (le moteur baisse de niveau tout seul si l'appareil rame). */
export const QUALITY = [
  { name: "high", pixelRatio: 2, shadows: true, shadowSize: 1024 },
  { name: "mid", pixelRatio: 1.5, shadows: true, shadowSize: 512 },
  { name: "low", pixelRatio: 1, shadows: false, shadowSize: 256 },
] as const;

/** Vitesses de marche (unités de scène / seconde). */
export const WALK = { jacob: 1.05, lilou: 1.0, cycle: 1.0 };

/** Rythme de l'intro 3D (ms). Total visé : 25–30 s. Les temps morts ont été retirés : chaque réplique s'enchaîne sur la précédente. */
export const TIMING3 = {
  startDelay: 150,
  typeMs: 36,
  typeMsShort: 44,
  typeMsCall: 56,
  typeMsFinal: 36,
  /** Respiration après le dernier mot : juste de quoi finir la lecture. */
  holdAfterText: 700,
  holdAfterShort: 520,
  holdAfterCall: 380,
  holdAfterFinal: 1100,
  /** Réaction finale (cœurs) avant la sortie. */
  reaction: 2400,
  fadeIn: 450,
  exitFade: 600,
};
