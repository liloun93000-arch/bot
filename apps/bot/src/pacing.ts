/**
 * Rythme des réponses (script V9.1, bloc 1) :
 *  - délai proportionnel à la longueur : ~1 s par tranche de 15 à 20 mots, minimum 2 s, maximum 12 s ;
 *  - réponses très longues découpées en 2 ou 3 messages, 1 à 2 s entre chacun.
 */
// Raccourci à la demande de Jacob (réponses jugées trop lentes) : 1 à 4 s, 0,8 s entre deux messages.
export const PACING = { minMs: 1000, maxMs: 4000, wordsPerSecond: 30, gapMs: 800, splitChars: 700, maxParts: 3 };

export function replyDelayMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const ms = Math.round((words / PACING.wordsPerSecond) * 1000);
  return Math.min(PACING.maxMs, Math.max(PACING.minMs, ms));
}

/**
 * Découpe une réponse longue aux sauts de paragraphe (jamais au milieu d'une ligne de grille),
 * en 2 ou 3 messages de taille comparable. Une réponse courte reste en un seul message.
 */
export function splitReply(text: string): string[] {
  const clean = text.trim();
  if (clean.length <= PACING.splitChars) return [clean];
  const paras = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const blocks = paras.length > 1 ? paras : clean.split("\n").filter((l) => l.trim());
  if (blocks.length < 2) return [clean];
  const parts = Math.min(PACING.maxParts, Math.max(2, Math.ceil(clean.length / PACING.splitChars)));
  const target = clean.length / parts;
  const out: string[] = [];
  let cur = "";
  const sep = paras.length > 1 ? "\n\n" : "\n";
  for (const b of blocks) {
    if (cur && cur.length + b.length > target && out.length < parts - 1) {
      out.push(cur);
      cur = b;
    } else cur = cur ? cur + sep + b : b;
  }
  if (cur) out.push(cur);
  return out;
}
