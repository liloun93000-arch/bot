/**
 * Bulle de dialogue réutilisable : vrai texte HTML, effet machine à écrire,
 * curseur, taille calculée à l'avance (aucun saut de ligne en cours de frappe),
 * jamais hors de l'écran, jamais sur un visage.
 */
import type { Clock } from "./clock";
import { clamp } from "./clock";

export interface BubbleOptions {
  text: string;
  /** Point visé par la queue de la bulle (au-dessus de la tête du locuteur). */
  anchor: () => { x: number; bottom: number };
  /** Limites horizontales de l'écran et zone à éviter (visage d'un autre personnage). */
  bounds: () => { left: number; right: number; top: number; maxW: number };
  msPerChar: number;
  shout?: boolean;
  /** Appelé à chaque caractère révélé (animation du personnage qui parle). */
  onChar?: (ch: string, i: number) => void;
}

export class Bubble {
  private root: HTMLElement;
  private chars: HTMLElement[] = [];
  private caret: HTMLElement;
  private tail: HTMLElement;
  private opts: BubbleOptions | null = null;
  private shown = 0;
  private visible = false;

  constructor(private host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "aj-bub";
    this.root.setAttribute("role", "status");
    this.root.style.visibility = "hidden";
    this.caret = document.createElement("i");
    this.caret.className = "aj-bub-caret";
    this.tail = document.createElement("b");
    this.tail.className = "aj-bub-tail";
    host.append(this.root);
  }

  /** Affiche la bulle et révèle le texte caractère par caractère. Résout quand tout est écrit. */
  async show(opts: BubbleOptions, clock: Clock): Promise<void> {
    this.opts = opts;
    this.root.className = "aj-bub" + (opts.shout ? " aj-bub-shout" : "");
    this.root.setAttribute("aria-label", opts.text);
    this.root.replaceChildren();
    this.chars = [];
    this.shown = 0;
    const inner = document.createElement("span");
    inner.className = "aj-bub-txt";
    inner.setAttribute("aria-hidden", "true");
    // Mots insécables : un mot ne se coupe jamais, la mise en page est figée dès le départ.
    for (const word of opts.text.split(/(\s+)/)) {
      if (/^\s+$/.test(word)) {
        inner.append(document.createTextNode(" "));
        continue;
      }
      const w = document.createElement("span");
      w.className = "aj-w";
      for (const ch of Array.from(word)) {
        const c = document.createElement("span");
        c.className = "aj-c";
        c.textContent = ch;
        w.append(c);
        this.chars.push(c);
      }
      inner.append(w);
    }
    this.root.append(inner, this.caret, this.tail);
    this.visible = true;
    this.place();
    this.root.style.visibility = "visible";
    this.root.classList.remove("aj-out");
    void this.root.offsetWidth;
    this.root.classList.add("aj-in");
    await clock.sleep(opts.shout ? 120 : 260);

    for (let i = 0; i < this.chars.length; i++) {
      this.chars[i]!.classList.add("on");
      this.shown = i + 1;
      this.moveCaret();
      const ch = this.chars[i]!.textContent ?? "";
      opts.onChar?.(ch, i);
      let d = opts.msPerChar * (0.7 + Math.random() * 0.6);
      if (/[,;:]/.test(ch)) d += 150;
      else if (/[.!?]/.test(ch)) d += 280;
      await clock.sleep(d);
    }
    this.caret.classList.add("done");
  }

  /** (Re)calcule la position : appelée à l'affichage et à chaque redimensionnement. */
  place(): void {
    if (!this.opts || !this.visible) return;
    const o = this.opts;
    const b = o.bounds();
    const a = o.anchor();
    this.root.style.maxWidth = Math.min(o.shout ? 260 : b.maxW, b.right - b.left) + "px";
    const r = this.root.getBoundingClientRect();
    const hostR = this.host.getBoundingClientRect();
    const w = r.width;
    const h = r.height;
    const tailH = 12;
    let left = a.x - w / 2;
    left = clamp(left, b.left, Math.max(b.left, b.right - w));
    let top = a.bottom - tailH - h;
    top = Math.max(b.top, top);
    this.root.style.left = left.toFixed(1) + "px";
    this.root.style.top = top.toFixed(1) + "px";
    this.root.style.transformOrigin = `${clamp(a.x - left, 12, w - 12).toFixed(1)}px 100%`;
    this.tail.style.left = clamp(a.x - left, 18, w - 18).toFixed(1) + "px";
    void hostR;
    this.moveCaret();
  }

  private moveCaret(): void {
    if (!this.visible || this.shown === 0) {
      this.caret.style.opacity = "0";
      return;
    }
    const c = this.chars[Math.min(this.shown, this.chars.length) - 1];
    if (!c) return;
    const rr = this.root.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    this.caret.style.opacity = "1";
    this.caret.style.transform = `translate3d(${(cr.right - rr.left + 1).toFixed(1)}px,${(cr.top - rr.top).toFixed(1)}px,0)`;
    this.caret.style.height = cr.height.toFixed(1) + "px";
  }

  /** Disparition animée. */
  async hide(clock: Clock): Promise<void> {
    if (!this.visible) return;
    this.root.classList.remove("aj-in");
    this.root.classList.add("aj-out");
    await clock.sleep(260);
    this.visible = false;
    this.root.style.visibility = "hidden";
    this.root.classList.remove("aj-out");
  }

  /** Rectangle écran actuel de la bulle (tests, évitements). */
  rect(): DOMRect {
    return this.root.getBoundingClientRect();
  }
  get isVisible(): boolean {
    return this.visible;
  }
  destroy(): void {
    this.root.remove();
  }
}
