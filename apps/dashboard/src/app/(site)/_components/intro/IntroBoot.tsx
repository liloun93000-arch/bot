import { INTRO_BOOT_SCRIPT } from "./session";

/**
 * Script inline (constant, sans donnée) exécuté avant le premier affichage :
 * décide si l'intro doit se jouer (une fois par session) et pose le voile noir.
 */
export function IntroBoot() {
  return <script dangerouslySetInnerHTML={{ __html: INTRO_BOOT_SCRIPT }} />;
}
