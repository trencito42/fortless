import { Select, NumberField, Notice } from '@/design-system';
import { useActionDialog, type ActionSpec } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { iso, money, mb } from '../../lib/format';
import type { Job, RuntimeState, Service } from '../../types';

/**
 * Every service operation as an ActionDialog spec. Contract (lifecycle) and runtime are changed by different operations on purpose:
 * suspending changes the contract and forces runtime offline; power actions only touch runtime and are refused unless the contract is ACTIVE.
 * Transitions are simulated with timers on the demo data. Real operations go through jobs and the provider adapter.
 */
export function useServiceOps() {
  const { data, patch, add, audit, newId } = useAdmin();
  const nav = useNav();
  const dlg = useActionDialog();
  const a = (s: Service) => ({ type: 'service', id: s.id, label: s.name });
  const job = (s: Service, type: string, error?: Job['error']): Job => ({ id: newId('job'), type, status: error ? 'failed' : 'completed', attempts: 1, maxAttempts: 5, correlationId: newId('cor'), idempotencyKey: `${type.toLowerCase()}:${s.id}:${Date.now().toString(36)}`, orderId: null, serviceId: s.id, customerId: s.customerId, nodeId: s.nodeId, error: error ?? null, unknownOutcome: false, createdAt: iso(0), startedAt: iso(0), finishedAt: iso(30_000), nextRetryAt: null, workerId: 'wrk_preview', logs: [{ at: iso(0), level: 'info', message: `${type} simulated in preview` }] });
  const run = (spec: ActionSpec) => dlg.run(spec);
  const later = (s: Service, runtime: RuntimeState, ms = 2500) => window.setTimeout(() => patch('services', s.id, { runtime }), ms);

  const power = (s: Service, action: 'start' | 'stop' | 'restart' | 'kill') => run({
    title: `${action[0]!.toUpperCase()}${action.slice(1)} server`, description: `Runtime action on ${s.name}. It does not change the contract.`, confirmLabel: action[0]!.toUpperCase() + action.slice(1), permission: 'services:manage', stepUp: true, tone: action === 'kill' ? 'danger' : 'default', reasonRequired: true,
    effects: [`Send a ${action} signal to the server through the provider adapter`, 'Record a job and an audit event'],
    onConfirm: ({ reason }) => {
      const mid: RuntimeState = action === 'stop' || action === 'kill' ? 'stopping' : 'starting'; const end: RuntimeState = action === 'stop' || action === 'kill' ? 'offline' : 'running';
      patch('services', s.id, { runtime: mid }); later(s, end); add('jobs', job(s, 'POWER_ACTION')); audit('service.power', a(s), { accountId: s.customerId, reason, before: { runtime: s.runtime }, after: { runtime: end } }); return `${s.name}: ${action} sent`;
    },
  });
  const suspend = (s: Service) => run({
    title: 'Suspend service', description: 'Changes the contract to SUSPENDED and stops the server. The customer keeps the data but cannot start it.', confirmLabel: 'Suspend service', permission: 'services:manage', stepUp: true, tone: 'danger',
    effects: ['Set contract status to SUSPENDED', 'Suspend the server at the provider and stop it', 'Email the customer'],
    onConfirm: ({ reason }) => { patch('services', s.id, { lifecycle: 'SUSPENDED', runtime: 'offline' }); patch('subscriptions', s.billing.subscriptionId, { status: 'PAST_DUE' }); add('jobs', job(s, 'SUSPEND_SERVICE')); audit('service.suspended', a(s), { accountId: s.customerId, reason, before: { lifecycle: s.lifecycle }, after: { lifecycle: 'SUSPENDED' } }); return `${s.name} suspended`; },
  });
  const unsuspend = (s: Service) => run({
    title: 'Unsuspend service', confirmLabel: 'Unsuspend', permission: 'services:manage', stepUp: true, description: 'Returns the contract to ACTIVE. The server stays offline until someone starts it.',
    onConfirm: ({ reason }) => { patch('services', s.id, { lifecycle: 'ACTIVE' }); add('jobs', job(s, 'UNSUSPEND_SERVICE')); audit('service.unsuspended', a(s), { accountId: s.customerId, reason, before: { lifecycle: s.lifecycle }, after: { lifecycle: 'ACTIVE' } }); return `${s.name} unsuspended`; },
  });
  const reinstall = (s: Service) => run({
    title: 'Reinstall server', description: 'Wipes the server files and runs the egg install script again. Backups are kept.', confirmLabel: 'Reinstall', permission: 'services:manage', stepUp: true, tone: 'danger', requireText: s.name, effects: ['Stop the server', 'Delete server files', 'Run the install script', 'Server returns offline'],
    onConfirm: ({ reason }) => { patch('services', s.id, { runtime: 'installing' }); later(s, 'offline', 4000); add('jobs', job(s, 'REINSTALL_SERVICE')); audit('service.reinstalled', a(s), { accountId: s.customerId, reason }); return `${s.name}: reinstall started`; },
  });
  const rebuild = (s: Service) => run({
    title: 'Rebuild container', description: 'Recreates the container with the current limits and image. Files are kept.', confirmLabel: 'Rebuild', permission: 'services:manage', reasonRequired: true, effects: ['Ask Wings to rebuild the container', 'Server restarts if it was running'],
    onConfirm: ({ reason }) => { patch('services', s.id, { runtime: s.runtime === 'running' ? 'starting' : s.runtime }); if (s.runtime === 'running') later(s, 'running'); add('jobs', job(s, 'REBUILD_SERVICE')); audit('service.rebuilt', a(s), { accountId: s.customerId, reason }); return 'Rebuild requested'; },
  });
  const changePlan = (s: Service) => {
    const options = data.plans.filter((p) => p.productId === s.productId && p.status === 'ACTIVE' && p.id !== s.planId);
    run({
      title: 'Change plan', description: 'Switches plan and resource limits. The price change applies from the next renewal; no proration is created in this preview.', confirmLabel: 'Change plan', permission: 'services:manage', stepUp: true, initial: { plan: options[0]?.id ?? '' },
      validate: (v) => (v['plan'] ? {} : { plan: 'Choose a plan.' }),
      fields: ({ values, set, errors }) => <div className="grid gap-3"><Select label="New plan" value={values['plan']} error={errors['plan']} onValueChange={(v) => set('plan', v ?? '')} options={options.map((p) => ({ value: p.id, label: `${p.name} · ${mb(p.resources.memoryMb)} RAM`, description: money({ amount: p.prices.find((x) => x.currency === s.billing.price.currency && x.interval === s.billing.interval)?.priceMinorUnits ?? 0, currency: s.billing.price.currency }) }))} />{options.length === 0 ? <Notice tone="warn">No other active plan for this product.</Notice> : null}</div>,
      onConfirm: ({ values, reason }) => {
        const p = data.plans.find((x) => x.id === values['plan'])!; const price = p.prices.find((x) => x.currency === s.billing.price.currency && x.interval === s.billing.interval);
        patch('services', s.id, { planId: p.id, planName: p.name, resources: { ...p.resources }, billing: { ...s.billing, price: { currency: s.billing.price.currency, amount: price?.priceMinorUnits ?? s.billing.price.amount } } });
        add('jobs', job(s, 'CHANGE_PLAN')); audit('service.plan_changed', a(s), { accountId: s.customerId, reason, before: { plan: s.planName }, after: { plan: p.name } }); return `Plan changed to ${p.name}`;
      },
    });
  };
  const resources = (s: Service) => run({
    title: 'Adjust resource limits', description: 'Overrides limits for this service only. The plan and price are not changed. Useful for compensation or temporary boosts.', confirmLabel: 'Apply limits', permission: 'services:manage', stepUp: true, reasonRequired: true,
    initial: { ram: String(s.resources.memoryMb), disk: String(s.resources.diskMb), cpu: String(s.resources.cpuPct) },
    validate: (v) => ({ ...(Number(v['ram']) < 128 || Number(v['ram']) > 65536 ? { ram: 'RAM must be 128–65536 MB.' } : {}), ...(Number(v['disk']) < 512 ? { disk: 'Disk must be at least 512 MB.' } : {}), ...(Number(v['cpu']) < 10 || Number(v['cpu']) > 800 ? { cpu: 'CPU must be 10–800 %.' } : {}) }),
    fields: ({ values, set, errors }) => <div className="grid gap-3 sm:grid-cols-3"><NumberField label="RAM (MB)" value={Number(values['ram'])} onValueChange={(v) => set('ram', String(v ?? ''))} error={errors['ram']} min={128} step={128} /><NumberField label="Disk (MB)" value={Number(values['disk'])} onValueChange={(v) => set('disk', String(v ?? ''))} error={errors['disk']} min={512} step={512} /><NumberField label="CPU (%)" value={Number(values['cpu'])} onValueChange={(v) => set('cpu', String(v ?? ''))} error={errors['cpu']} min={10} step={10} /></div>,
    onConfirm: ({ values, reason }) => { patch('services', s.id, { resources: { ...s.resources, memoryMb: Number(values['ram']), diskMb: Number(values['disk']), cpuPct: Number(values['cpu']) } }); add('jobs', job(s, 'UPDATE_LIMITS')); audit('service.limits_changed', a(s), { accountId: s.customerId, reason, before: { ram: mb(s.resources.memoryMb) }, after: { ram: mb(Number(values['ram'])) } }); return 'Limits updated'; },
  });
  const reconcile = (s: Service) => run({
    title: 'Reconcile with provider', description: 'Reads the server from the provider and compares it with the business record. It never overwrites the contract.', confirmLabel: 'Run reconciliation', permission: 'services:manage', reasonRequired: false,
    effects: ['Read server by external id; if unknown, search by correlation tag (never create)', 'Update provider sync state and last-sync time', 'Report differences; changes need a separate decision'],
    onConfirm: () => { patch('services', s.id, (cur) => ({ provider: { ...cur.provider, sync: cur.provider.sync === 'unlinked' || cur.provider.sync === 'missing_remote' ? cur.provider.sync : ('in_sync' as const), lastSyncAt: iso(0) } })); add('jobs', job(s, 'RECONCILE_SERVICE')); audit('service.reconciled', a(s), { accountId: s.customerId }); return s.provider.sync === 'in_sync' ? 'Already in sync' : s.provider.sync === 'drift' ? 'Drift cleared on the provider side' : 'No remote server found; see Provider tab'; },
  });
  const relink = (s: Service) => run({
    title: 'Relink to provider server', description: 'Attach an existing provider server found by correlation tag. Does not create anything.', confirmLabel: 'Relink', permission: 'services:manage', stepUp: true, reasonRequired: true, effects: [`Search provider for tag ${s.provider.correlationTag}`, 'Store the external id if exactly one candidate exists'],
    onConfirm: ({ reason }) => { patch('services', s.id, (cur) => ({ provider: { ...cur.provider, sync: 'in_sync' as const, externalId: 2000 + Number(s.id.replace(/\D/g, '')), allocationId: 6000 + Number(s.id.replace(/\D/g, '')), lastSyncAt: iso(0) } })); audit('service.relinked', a(s), { accountId: s.customerId, reason }); return 'Relinked to a single matching provider server'; },
  });
  const terminate = (s: Service) => run({
    title: 'Terminate service', description: 'Permanently deletes the server and its data at the provider. Cannot be undone after the recovery window.', confirmLabel: 'Terminate service', permission: 'services:manage', stepUp: true, tone: 'danger', requireText: s.id,
    effects: ['Delete the provider server and release its allocation', 'Cancel the subscription', 'Keep invoices and the audit trail', 'Large or contested terminations also need an approval request (see Staff → Approvals)'],
    onConfirm: ({ reason }) => { patch('services', s.id, { lifecycle: 'TERMINATED', runtime: 'unknown', provider: { ...s.provider, sync: 'missing_remote' as const } }); patch('subscriptions', s.billing.subscriptionId, { status: 'CANCELED' }); add('jobs', job(s, 'TERMINATE_SERVICE')); audit('service.terminated', a(s), { accountId: s.customerId, reason, before: { lifecycle: s.lifecycle }, after: { lifecycle: 'TERMINATED' } }); return `${s.name} terminated`; },
  });
  const recover = (s: Service) => run({
    title: 'Recover from termination', description: 'Possible only while backups or provider data are still inside the retention window. Restores the contract as SUSPENDED for review.', confirmLabel: 'Start recovery', permission: 'services:manage', stepUp: true, reasonRequired: true,
    effects: ['Check retention window and latest backup', 'Recreate the provider server from the backup (job)', 'Set contract to SUSPENDED until an administrator reviews it'],
    onConfirm: ({ reason }) => { patch('services', s.id, { lifecycle: 'SUSPENDED', runtime: 'offline', provider: { ...s.provider, sync: 'unlinked' as const } }); add('jobs', job(s, 'RECOVER_SERVICE')); audit('service.recovery_started', a(s), { accountId: s.customerId, reason }); return 'Recovery started: service is suspended and unlinked until it is recreated'; },
  });
  const migrate = (s: Service) => nav(`/services/${s.id}/migrate`);
  return { node: dlg.node, power, suspend, unsuspend, reinstall, rebuild, changePlan, resources, reconcile, relink, terminate, recover, migrate };
}
