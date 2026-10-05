/**
 * Responsive : toutes les mesures de la scène sont recalculées pour la taille
 * réelle de l'écran. UNE SEULE hauteur de personnage (`charH`) pour Jacob ET Lilou,
 * une seule ligne de sol (`floorY`).
 */
import { CHARACTER_BASE_HEIGHT } from "./config";
import { clamp } from "./clock";

export interface Layout {
  vw: number;
  vh: number;
  /** Ligne de sol commune. */
  floorY: number;
  /** Hauteur commune sol → sommet de la tête, en px écran. */
  charH: number;
  jacobStartX: number;
  jacobStopX: number;
  lilouStartX: number;
  lilouStopX: number;
  bubbleMaxW: number;
  margin: number;
  /** Plafond haut de la zone des bulles (sous le bouton « Passer »). */
  topSafe: number;
}

export function computeLayout(vw: number, vh: number): Layout {
  const stageW = Math.min(vw, 540);
  const x0 = (vw - stageW) / 2;
  const landscape = vh < 480 || vw > vh * 1.15;
  const floorY = Math.round(vh * (landscape ? 0.9 : 0.77));
  const byH = vh * (landscape ? CHARACTER_BASE_HEIGHT.landscapeVh : CHARACTER_BASE_HEIGHT.portraitVh);
  const byW = stageW * CHARACTER_BASE_HEIGHT.stageWidthRatio;
  const charH = Math.round(clamp(Math.min(byH, byW) * CHARACTER_BASE_HEIGHT.scale, CHARACTER_BASE_HEIGHT.minPx, CHARACTER_BASE_HEIGHT.maxPx));
  const margin = vw < 360 ? 10 : 14;
  // Écran étroit : on rapproche les personnages (jamais de redimensionnement séparé).
  const cx = x0 + stageW * 0.5;
  const sep = clamp(charH * 0.92, 90, stageW * 0.5);
  const jacobStopX = Math.round(cx - sep * 0.5 - stageW * 0.02);
  const lilouStopX = Math.round(Math.min(cx + sep * 0.5 - stageW * 0.02, vw - margin - charH * 0.27));
  return {
    vw,
    vh,
    floorY,
    charH,
    jacobStartX: -Math.round(charH * 0.5),
    jacobStopX,
    lilouStartX: vw + Math.round(charH * 0.5),
    lilouStopX,
    bubbleMaxW: Math.round(Math.min(300, stageW - margin * 2)),
    margin,
    topSafe: 54,
  };
}
