/**
 * Three distinct grouping geometries. They are never mixed.
 *
 * 1. Joined segmented control   SegmentedControl: one pill container (bg-s3, 3px padding) holding pill thumbs. One choice.
 * 2. Closely grouped pills      ToggleButtonGroup, SplitButton, ToolbarGroup: every item is a complete pill, 6px apart.
 * 3. Independent grouped actions ButtonGroup (Start / Restart / Stop): every item is a complete pill, 8px apart.
 *
 * In 2 and 3 no corner is ever overridden per position. First, middle and last items share one geometry (that is what
 * "consistent" means), and nothing clips the focus ring because there is no overflow:hidden and the gap exceeds the ring width.
 * Earlier versions gave inner corners a different radius from outer ones; a 9999px corner next to a 14px corner makes CSS scale
 * every radius on that edge down, so the inner side collapsed to a hard edge. Do not reintroduce per-position radii.
 */
export const closeGroupGap = 'gap-1.5';
export const independentGroupGap = 'gap-2';
