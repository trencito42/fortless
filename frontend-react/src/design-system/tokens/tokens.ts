/**
 * Token catalogue for documentation and the workbench. The source of truth is src/styles/index.css.
 * Components never read these values; they use Tailwind utilities backed by CSS variables.
 */
export const COLOR_TOKENS = [
  { group: 'Surface', tokens: ['bg', 's1', 's2', 's3', 's4'] },
  { group: 'Text', tokens: ['ink', 'ink2', 'ink3'] },
  { group: 'Interactive', tokens: ['accent', 'accent-h', 'accent-bg', 'on-accent'] },
  { group: 'Status', tokens: ['good', 'good-bg', 'warn', 'warn-bg', 'bad', 'bad-bg', 'info', 'info-bg', 'violet', 'violet-bg'] },
  { group: 'Console', tokens: ['con', 'con-ink', 'con-dim', 'con-ok', 'con-warn', 'con-bad'] },
  { group: 'Brand', tokens: ['lime', 'lime-ink'] },
] as const;

export const RADII = [
  { name: 'xs', px: 8, use: 'tags, kbd' },
  { name: 'sm', px: 12, use: 'menu items, small tiles' },
  { name: 'md', px: 14, use: 'inputs, nav items' },
  { name: 'lg', px: 22, use: 'cards, popups' },
  { name: 'xl', px: 28, use: 'sheets, shell panels' },
  { name: 'full', px: 999, use: 'buttons, pills, segmented controls' },
] as const;

export const BREAKPOINTS = [320, 375, 390, 430, 768, 1024, 1440, 1920] as const;
