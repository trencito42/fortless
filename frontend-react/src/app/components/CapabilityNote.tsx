import { Notice } from '@/design-system';
import { capabilities } from '../data/api';

/** Says plainly what a page is backed by. Production areas show nothing; simulated and planned areas are labelled so nobody mistakes them for live. */
export function CapabilityNote({ area }: { area: keyof typeof capabilities }) {
  const c = capabilities[area];
  if (!c || c.status === 'production') return null;
  return (
    <Notice tone="info" title={c.status === 'planned' ? 'Planned feature (prototype)' : 'Prototype data'}>
      {c.note ?? 'This screen runs on simulated data. Actions change only this browser session.'}
    </Notice>
  );
}
