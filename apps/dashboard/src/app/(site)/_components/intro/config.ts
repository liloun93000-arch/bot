/**
 * Configuration de l'introduction animée : états, dialogues, timings.
 * Tout ce qu'on voudra retoucher plus tard (texte, rythme) est ICI.
 */

export const STATES = [
  "ENTER_JACOB",
  "JACOB_FACE_USER",
  "MESSAGE_1",
  "MESSAGE_2",
  "CALL_LILOU",
  "ENTER_LILOU",
  "JACOB_TALKS_TO_LILOU",
  "END_INTRO",
] as const;
export type IntroState = (typeof STATES)[number];

export const DIALOGUE = {
  message1: "Frérot, n'oublie pas de dire à Lilou que c'est la meilleure",
  message2: "Regarde comment on fait",
  call: "LILOU !",
  final: "Lilou t'es la meilleure, je sais pas ce que je ferais sans toi.",
} as const;

/**
 * ÉCHELLE COMMUNE ET VERROUILLÉE — l'unique réglage de taille des deux personnages.
 * La hauteur « sol → sommet de la tête/casquette » est la même pour Jacob et Lilou
 * (les sprites sont normalisés sur cette hauteur). Pour agrandir ou réduire les DEUX
 * ensemble : modifier `scale` (1 = réglage actuel).
 */
export const CHARACTER_BASE_HEIGHT = {
  scale: 1,
  /** Part de la hauteur d'écran (portrait / paysage) et de la largeur de scène. */
  portraitVh: 0.31,
  landscapeVh: 0.46,
  stageWidthRatio: 0.6,
  minPx: 120,
  maxPx: 340,
} as const;

/** Durées en millisecondes (sauf mention contraire). */
export const TIMING = {
  startDelay: 300,
  /** Vitesse de marche en hauteurs de personnage par seconde. */
  jacobWalk: 0.78,
  lilouWalk: 0.6,
  pauseAfterJacobStops: 650,
  pauseAfterFacingUser: 900,
  typeMs: 40,
  typeMsMessage2: 48,
  typeMsCall: 62,
  typeMsFinal: 42,
  /** Temps de lecture : base + par caractère. */
  readBase: 520,
  readPerChar: 30,
  readMin: 1100,
  pauseBetweenBubbles: 520,
  pauseAfterMessage2: 650,
  pauseBeforeLilou: 950,
  pauseAfterLilouStops: 450,
  /** Après la dernière phrase : la blague doit respirer. */
  finalHold: 2100,
  endPause: 900,
  revealMs: 900,
} as const;

export const readTime = (text: string): number =>
  Math.max(TIMING.readMin, TIMING.readBase + text.length * TIMING.readPerChar);

/** Clé de session : l'intro ne se rejoue pas pendant la navigation. */
export const SESSION_KEY = "aj-intro-v1";
