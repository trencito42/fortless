/**
 * Petal Design System — Bezier Sparkline Primitives
 * Source: blueprint/fortless-blueprint/design/parts/z4.js
 */

export function smooth(points: [number, number][]): string {
  if (!points || points.length < 2) return '';
  const first = points[0];
  if (!first) return '';
  let d = `M${first[0]} ${first[1]}`;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i - 1] || points[i]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const e = points[i + 2] || c;
    d += `C${b[0] + (c[0] - a[0]) / 6} ${b[1] + (c[1] - a[1]) / 6} ${c[0] - (e[0] - b[0]) / 6} ${c[1] - (e[1] - b[1]) / 6} ${c[0]} ${c[1]}`;
  }
  return d;
}

export function spark(vals: number[], color = 'var(--accent)', fill = true): string {
  if (!vals || vals.length < 2) return '';
  const W = 120;
  const H = 36;
  const mx = Math.max(...vals);
  const mn = Math.min(...vals);
  const n = vals.length;
  const points: [number, number][] = vals.map((v, i) => [
    (i / (n - 1)) * W,
    H - 4 - ((v - mn) / (mx - mn || 1)) * (H - 10),
  ]);
  const d = smooth(points);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${
    fill === false ? '' : `<path d="${d}L${W} ${H}L0 ${H}Z" fill="${color}" opacity=".12"/>`
  }<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
