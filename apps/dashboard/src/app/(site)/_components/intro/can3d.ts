/** Test léger (sans charger three.js) : cet appareil peut-il raisonnablement jouer la 3D ? */
export function canRun3D(): boolean {
  try {
    if (typeof DecompressionStream === "undefined") return false;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return false;
    if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency < 4) return false;
    if (typeof nav.deviceMemory === "number" && nav.deviceMemory < 2) return false;
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
