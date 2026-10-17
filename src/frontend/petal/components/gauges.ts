/**
 * Petal Design System — Gauges and Progress Bars
 * Source: blueprint/fortless-blueprint/design/parts/z4.js
 */

export function gauge(percent: number, label: string, color = 'var(--accent)'): string {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  return `
    <div class="z-gauge" style="display:flex;flex-direction:column;gap:4px">
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span class="muted">${label}</span>
        <b>${clamped}%</b>
      </div>
      <div style="height:6px;background:var(--s3);border-radius:999px;overflow:hidden">
        <div style="width:${clamped}%;height:100%;background:${color};border-radius:999px;transition:width 0.3s ease"></div>
      </div>
    </div>
  `;
}
