import type { ReactNode } from 'react';

export type Category = 'Foundations' | 'Primitives' | 'Actions' | 'Forms' | 'Overlays' | 'Navigation' | 'Data display' | 'Charts' | 'Technical' | 'Hosting compositions' | 'Views';
export type Layer = 'A: primitive' | 'B: composition' | 'C: Fortless' | 'Shell' | 'View';
export type Status = 'planned' | 'implemented' | 'partial';

export interface Scenario {
  name: string;
  note?: string;
  render: () => ReactNode;
  /** Scenario needs the whole viewport (app shell). */
  fullBleed?: boolean;
}

export interface StoryDef {
  /** kebab-case, unique. Used in the URL and by tests. */
  id: string;
  title: string;
  category: Category;
  layer: Layer;
  purpose: string;
  /** Prototype or file this was derived from, or "new" when there was no prototype. */
  source: string;
  variants: string[];
  /** Main props, one short line each. */
  props: string[];
  /** What keyboard and assistive tech users get. Tested behavior only. */
  a11y: string;
  responsive: string;
  status: Status;
  /** Honest limits: what is not done yet. */
  gaps?: string;
  scenarios: Scenario[];
}

export const defineStory = (s: StoryDef): StoryDef => s;
