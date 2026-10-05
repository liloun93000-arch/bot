/** Horloge d'animation : une seule boucle rAF, des « sleep » pilotés par cette boucle. */

export class IntroCancelled extends Error {
  constructor() {
    super("intro-cancelled");
  }
}

type Tick = (dt: number, t: number) => void;
interface Timer {
  at: number;
  res: () => void;
  rej: (e: unknown) => void;
}

export class Clock {
  t = 0;
  cancelled = false;
  rendering = true;
  private tickers: Tick[] = [];
  private timers: Timer[] = [];
  private raf = 0;
  private last = 0;
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const win = window as unknown as { __AJ_FIXED?: number; __AJ_K?: number };
    const step = (dt: number): void => {
      this.t += dt;
      for (const f of this.tickers) f(dt, this.t);
      if (this.timers.length) {
        this.timers.sort((a, b) => a.at - b.at);
        while (this.timers.length && this.timers[0]!.at <= this.t) this.timers.shift()!.res();
      }
    };
    const loop = (now: number) => {
      if (!this.running) return;
      if (win.__AJ_FIXED) {
        // Banc d'essai (tests uniquement) : pas fixe, plusieurs pas par image, micro-tâches vidées entre les pas.
        const k = win.__AJ_K === undefined ? 1 : win.__AJ_K;
        if (win.__AJ_K !== undefined) win.__AJ_K = 0; // budget de pas consommé
        void (async () => {
          for (let i = 0; i < k && this.running; i++) {
            this.rendering = i === k - 1;
            step(win.__AJ_FIXED!);
            for (let j = 0; j < 12; j++) await null;
          }
          this.last = now;
          if (this.running) this.raf = requestAnimationFrame(loop);
        })();
        return;
      }
      // Onglet en arrière-plan : on plafonne dt, l'animation se met simplement en pause.
      const dt = Math.min(0.034, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.rendering = true;
      step(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  onTick(f: Tick): () => void {
    this.tickers.push(f);
    return () => {
      this.tickers = this.tickers.filter((x) => x !== f);
    };
  }

  sleep(ms: number): Promise<void> {
    if (this.cancelled) return Promise.reject(new IntroCancelled());
    return new Promise<void>((res, rej) => {
      this.timers.push({ at: this.t + ms / 1000, res, rej });
    });
  }

  cancel(): void {
    this.cancelled = true;
    const pending = this.timers;
    this.timers = [];
    for (const x of pending) x.rej(new IntroCancelled());
  }
}

/** Ressort amorti (valeurs en unités libres) : donne de l'inertie et du rebond. */
export class Spring {
  x: number;
  v = 0;
  target: number;
  constructor(
    x = 0,
    public k = 180,
    public c = 14,
  ) {
    this.x = x;
    this.target = x;
  }
  step(dt: number): void {
    const n = 2;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.k * (this.target - this.x) - this.c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
  }
  kick(v: number): void {
    this.v += v;
  }
}

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const smooth = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
