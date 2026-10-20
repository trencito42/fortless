import { AlertDialog, Button, ButtonGroup, StatusBadge, LoadingButton } from '@/design-system';
import { serverStatus, type ServerState } from './status';

export type PowerAction = 'start' | 'stop' | 'restart' | 'kill';

export interface ServerPowerToolbarProps {
  state: ServerState;
  serverName: string;
  /** Sends the signal. May be async; errors are shown by the caller (toast) or rethrown. */
  onPower: (action: PowerAction) => void | Promise<void>;
  onError?: (action: PowerAction, error: unknown) => void;
  /** Disable everything with a reason, e.g. when the user lacks the control permission. */
  disabledReason?: string;
  /** Per-action authorisation. An omitted key means allowed; false disables only that action and says why in its tooltip text. */
  allowed?: Partial<Record<PowerAction, boolean>>;
  /** Hide the status badge when the page header already shows the state. */
  hideStatus?: boolean;
}

/**
 * Power controls. Which actions are available follows the state, and Kill (data-loss risk) always asks first.
 * Transitional states (starting, stopping) keep Stop and Kill reachable so a hung server can be forced down.
 */
export function ServerPowerToolbar({ state, serverName, onPower, onError, disabledReason, hideStatus, allowed }: ServerPowerToolbarProps) {
  const s = serverStatus[state];
  const locked = !!disabledReason || state === 'installing' || state === 'suspended';
  const why = disabledReason ?? (state === 'installing' ? 'Wait for the install to finish.' : state === 'suspended' ? 'Suspended servers cannot be controlled.' : undefined);
  const canStart = state === 'offline' || state === 'error' || state === 'unknown';
  const canStop = state === 'running' || state === 'starting' || state === 'stopping';
  const ok = (a: PowerAction) => allowed?.[a] !== false;
  const denied = (['start', 'restart', 'stop', 'kill'] as const).filter((a) => !ok(a));
  const run = (a: PowerAction) => () => onPower(a);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {hideStatus ? null : <StatusBadge tone={s.tone} live={s.live}>{s.label}</StatusBadge>}
      <ButtonGroup aria-label={`Power controls for ${serverName}`}>
        <LoadingButton variant="primary" leadingIcon="play" disabled={locked || !canStart || !ok('start')} onClick={run('start')} onError={(e) => onError?.('start', e)}>Start</LoadingButton>
        <LoadingButton variant="secondary" leadingIcon="replay" disabled={locked || state !== 'running' || !ok('restart')} onClick={run('restart')} onError={(e) => onError?.('restart', e)}>Restart</LoadingButton>
        <LoadingButton variant="secondary" leadingIcon="stop" disabled={locked || !canStop || !ok('stop')} onClick={run('stop')} onError={(e) => onError?.('stop', e)}>Stop</LoadingButton>
      </ButtonGroup>
      <AlertDialog
        trigger={<Button variant="danger-subtle" leadingIcon="power" disabled={locked || !canStop || !ok('kill')}>Kill</Button>}
        title={`Force stop ${serverName}?`}
        description="Kill cuts the process immediately. Unsaved world data may be lost. Use it only when Stop does not work."
        confirmLabel="Kill server"
        tone="danger"
        onConfirm={() => onPower('kill')}
      />
      {!why && denied.length ? <p className="text-[13px] font-semibold text-ink3">Your access level cannot {denied.join(', ')}.</p> : null}
      {why ? <p className="text-[13px] font-semibold text-ink3">{why}</p> : null}
    </div>
  );
}
