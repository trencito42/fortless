/** One definition of a service's status tag and whether it can be controlled, shared by every page that lists services. */
export interface StateInput {
  contract_status?: string | null; contractStatus?: string | null;
  runtime_state?: string | null; runtimeState?: string | null;
}
export type Tone = 'good' | 'warn' | 'bad' | 'info';
export interface ServiceStateView { label: string; tone: Tone; running: boolean; controllable: boolean }

const RUNTIME: Record<string, { label: string; tone: Tone }> = {
  RUNNING: { label: 'RUNNING', tone: 'good' },
  STOPPED: { label: 'OFFLINE', tone: 'info' },
  OFFLINE: { label: 'OFFLINE', tone: 'info' },
  INSTALLING: { label: 'INSTALLING', tone: 'warn' },
  ERROR: { label: 'ERROR', tone: 'bad' },
};
const CONTRACT: Record<string, Tone> = { TERMINATED: 'bad', SUSPENDED: 'warn', PENDING: 'warn', PROVISIONING: 'warn', FAILED: 'bad' };

export function serviceState(s: StateInput): ServiceStateView {
  const contract = String(s.contract_status ?? s.contractStatus ?? 'ACTIVE').toUpperCase();
  if (contract !== 'ACTIVE') return { label: contract, tone: CONTRACT[contract] ?? 'warn', running: false, controllable: false };
  const runtime = String(s.runtime_state ?? s.runtimeState ?? 'UNKNOWN').toUpperCase();
  const r = RUNTIME[runtime] ?? { label: runtime, tone: 'info' as Tone };
  return { label: r.label, tone: r.tone, running: runtime === 'RUNNING', controllable: true };
}

/** Maps a live Wings state (running, offline, starting, stopping) onto the same tags. */
export function liveState(state: string): { label: string; tone: Tone } {
  const s = state.toLowerCase();
  if (s === 'running') return RUNTIME['RUNNING']!;
  if (s === 'offline') return RUNTIME['OFFLINE']!;
  return { label: state.toUpperCase(), tone: 'warn' };
}
