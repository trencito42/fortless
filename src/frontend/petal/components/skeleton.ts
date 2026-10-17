/**
 * Petal Design System — page skeletons (.z-skb)
 * Source: blueprint/fortless-blueprint/design/parts/z6.css and z6.js.
 */

export type SkeletonKind = 'dashboard' | 'list' | 'table' | 'profile' | 'article';

function block(width: string, height: number, radius = '10px'): string {
  return `<div class="skel" style="width:${width};height:${height}px;border-radius:${radius}"></div>`;
}

export function renderSkeleton(kind: SkeletonKind, label = 'Loading content'): string {
  const row = () => `<div class="r">${block('40px', 40, '50%')}<div class="c">${block('60%', 12)}${block('85%', 10)}</div></div>`;
  const views: Record<SkeletonKind, string> = {
    dashboard: `<div class="g z-skeleton-metrics">${[0, 1, 2, 3].map(() => `<div class="c z-skeleton-card">${block('50%', 10)}${block('70%', 22)}</div>`).join('')}</div>${block('100%', 154, '20px')}${block('100%', 180, '20px')}`,
    list: [0, 1, 2, 3].map(row).join(''),
    table: `${block('100%', 32, '10px')}${[0, 1, 2, 3].map(() => `<div class="r">${block('25%', 12)}${block('30%', 12)}${block('15%', 12)}${block('15%', 12)}</div>`).join('')}`,
    profile: `${block('100%', 60, '16px')}<div class="r">${block('64px', 64, '50%')}<div class="c">${block('45%', 14)}${block('30%', 10)}</div></div>${block('90%', 10)}${block('70%', 10)}`,
    article: `${block('70%', 22)}<div class="r">${block('28px', 28, '50%')}${block('30%', 10)}</div>${block('100%', 130, '16px')}${block('100%', 10)}${block('88%', 10)}`,
  };
  return `<div class="z-skb" role="status" aria-live="polite"><span class="sr">${label}</span>${views[kind]}</div>`;
}
