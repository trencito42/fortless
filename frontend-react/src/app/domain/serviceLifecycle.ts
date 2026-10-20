import type { ServiceLifecycle, ServiceRow } from './types';

export type ServiceVisibility = 'active' | 'suspended' | 'terminated' | 'all';

export const SERVICE_VISIBILITY_OPTIONS: Array<{ value: ServiceVisibility; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'all', label: 'All' },
];

export const SERVICE_LIFECYCLE_PRESENTATION: Record<ServiceLifecycle, { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  active: { label: 'Active', tone: 'good' },
  'past-due': { label: 'Past due', tone: 'warn' },
  suspended: { label: 'Suspended', tone: 'warn' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  terminated: { label: 'Terminated', tone: 'bad' },
};

/** PAST_DUE is operationally locked by the backend; CANCELLED is a final/closed lifecycle. */
export function lifecycleVisibility(lifecycle: ServiceLifecycle): Exclude<ServiceVisibility, 'all'> {
  if (lifecycle === 'active') return 'active';
  if (lifecycle === 'past-due' || lifecycle === 'suspended') return 'suspended';
  return 'terminated';
}

export const serviceMatchesVisibility = (service: ServiceRow, visibility: ServiceVisibility) => visibility === 'all' || lifecycleVisibility(service.lifecycle) === visibility;
export const visibleServices = (services: ServiceRow[], visibility: ServiceVisibility = 'active') => services.filter((service) => serviceMatchesVisibility(service, visibility));
export const serviceCanUsePower = (service: Pick<ServiceRow, 'lifecycle'>) => service.lifecycle === 'active';
export const serviceConsumesResources = (service: Pick<ServiceRow, 'lifecycle'>) => service.lifecycle === 'active';

const STORAGE_KEY = 'fortless.react.services.visibility.v1';
export function readServiceVisibility(): ServiceVisibility {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'active' || value === 'suspended' || value === 'terminated' || value === 'all' ? value : 'active';
  } catch { return 'active'; }
}
export function writeServiceVisibility(value: ServiceVisibility): void {
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* Storage is optional; Active remains the default. */ }
}
