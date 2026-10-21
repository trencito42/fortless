import { makeRng } from '../fixtures/rng';
import { ADMIN_NOW, HOUR } from './format';

/** Deterministic synthetic time series (per id) for resource-usage charts. Always labelled "synthetic sample" in the UI. */
export function syntheticSeries(id: string, points: number, base: number, spread: number, stepMs = HOUR) {
  const seed = [...id].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);
  const r = makeRng(seed);
  let v = base;
  return Array.from({ length: points }, (_, i) => {
    v = Math.max(0, Math.min(base * 2, v + (r.next() - 0.5) * spread));
    return { t: new Date(ADMIN_NOW - (points - 1 - i) * stepMs).toISOString().slice(11, 16), v: Math.round(v * 10) / 10 };
  });
}
