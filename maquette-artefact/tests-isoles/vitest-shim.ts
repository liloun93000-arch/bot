type Fn = () => unknown;
const tests: Array<[string, Fn]> = []; let cur = "";
export const describe = (n: string, f: Fn) => { cur = n; f(); };
export const it = (n: string, f: Fn) => { tests.push([cur + " › " + n, f]); };
function assertEq(a: any, b: any, m?: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m ?? "") + ` attendu ${JSON.stringify(b)} reçu ${JSON.stringify(a)}`); }
export const expect = (v: any, msg?: string): any => Object.assign(mk(v, msg), { not: neg(v, msg) });
function neg(v: any, msg?: string) {
  const inv = (f: () => void, label: string) => { let threw = false; try { f(); } catch { threw = true; } if (!threw) throw new Error((msg ?? "") + " attendu NON " + label); };
  const m = mk(v, msg);
  return {
    toBe: (b: any) => inv(() => m.toBe(b), "toBe " + b),
    toContain: (x: any) => inv(() => m.toContain(x), "toContain " + x),
    toMatch: (r: RegExp) => inv(() => m.toMatch(r), "toMatch " + r),
    toEqual: (b: any) => inv(() => m.toEqual(b), "toEqual"),
  };
}
const mk = (v: any, msg?: string): any => ({
  toBe: (b: any) => { if (v !== b) throw new Error((msg ?? "") + ` attendu ${b} reçu ${v}`); },
  toEqual: (b: any) => assertEq(v, b, msg),
  toBeDefined: () => { if (v === undefined) throw new Error((msg ?? "") + " indéfini"); },
  toBeUndefined: () => { if (v !== undefined) throw new Error((msg ?? "") + " défini"); },
  toBeTruthy: () => { if (!v) throw new Error((msg ?? "") + " faux"); },
  toBeGreaterThan: (n: number) => { if (!(v > n)) throw new Error((msg ?? "") + ` ${v} pas > ${n}`); },
  toBeNull: () => { if (v !== null) throw new Error((msg ?? "") + " non nul " + v); },
  toMatch: (r: RegExp) => { if (!r.test(v)) throw new Error((msg ?? "") + ` ${v} ne correspond pas à ${r}`); },
  toContain: (x: any) => { if (!v.includes(x)) throw new Error((msg ?? "") + ` ${JSON.stringify(v)} ne contient pas ${x}`); },
});
export async function run() {
  let ok = 0, ko = 0;
  for (const [n, f] of tests) { try { await f(); ok++; console.log("  ✓", n); } catch (e: any) { ko++; console.log("  ✗", n, "\n     ", e.message); } }
  console.log(`\n${ok} ok, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
}
