import { Notice } from '@/design-system';
import { capabilities } from '../data/api';

/** Says plainly which live backend capability is missing or partial. */
export function CapabilityNote({ area }: { area: keyof typeof capabilities }) {
  const c = capabilities[area];
  if (!c || c.status === 'production') return null;
  return (
    <Notice tone="info" title={c.status === 'planned' ? 'Backend capability unavailable' : 'Partially available'}>
      {c.note ?? 'This operation is not exposed by the current backend.'}
    </Notice>
  );
}
