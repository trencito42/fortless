import { createContext, useContext } from 'react';
import type { ServiceDetailDto } from './contracts';
import type { LiveChannel } from './live';
import type { ServiceSummary } from './model';
import type { ServiceDetailPorts } from './ports';

export interface ServiceCtx {
  id: string;
  ports: ServiceDetailPorts;
  detail: ServiceDetailDto;
  summary: ServiceSummary;
  live: LiveChannel;
  can: (permission: string) => boolean;
  /** Re-reads GET /services/:id (state, limits) after an action that changes it. */
  refresh: () => void;
}
const Ctx = createContext<ServiceCtx | null>(null);
export const ServiceProvider = Ctx.Provider;
export function useService(): ServiceCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useService must be used inside ServiceDetailView');
  return c;
}
