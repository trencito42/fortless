/** Deterministic PRNG so the synthetic universe is identical on every load. */
export function makeRng(seed = 20261021) {
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min;
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!;
  const chance = (p: number) => next() < p;
  const weighted = <T,>(items: readonly (readonly [T, number])[]): T => {
    const total = items.reduce((a, [, w]) => a + w, 0); let r = next() * total;
    for (const [v, w] of items) { r -= w; if (r <= 0) return v; }
    return items[items.length - 1]![0];
  };
  const hex = (n: number) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(next() * 16)]).join('');
  return { next, int, pick, chance, weighted, hex };
}
export type Rng = ReturnType<typeof makeRng>;
export const pad = (n: number, w = 4) => String(n).padStart(w, '0');
