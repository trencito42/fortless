import { Notice } from '@/design-system';
import type { ReactNode } from 'react';

/** Tells the viewer an operation is simulated inside the browser. Used on every screen that has mutating actions. */
export function PreviewNote({ children }: { children?: ReactNode }) {
  return <Notice tone="info" title="Preview mode">{children ?? 'Actions on this screen change demo data in this browser tab only. Nothing is sent to Stripe, Pterodactyl, email or customers.'}</Notice>;
}

/** Marks a view that needs a backend capability that does not exist yet. */
export function Unsupported({ title = 'Not supported by the backend yet', children }: { title?: string; children: ReactNode }) {
  return <Notice tone="warn" title={title}>{children}</Notice>;
}

export function NoAccess({ permission }: { permission: string }) {
  return <Notice tone="warn" title="You don’t have access to this section">Your current role does not include <code className="font-mono font-bold">{permission}</code>. Switch the preview role from the profile menu to see how permissions change the interface.</Notice>;
}
