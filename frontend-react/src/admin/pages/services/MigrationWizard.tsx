import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Checkbox, EmptyState, FormWizard, Notice, RadioGroup, Select, StatusBadge, TaskProgress, TextField, Textarea, type TaskStep, type WizardStep } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Section, Split } from '../../components/Cards';
import { CapacityBar } from '../../components/CapacityBar';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession, STEP_UP_MINUTES } from '../../session';
import { useToast } from '../../toast';
import { REGION_NAMES } from '../../fixtures/commerce';
import { iso, mb } from '../../lib/format';
import { nodeCapacity } from '../../lib/metrics';
import type { InfraNode, Service } from '../../types';

interface V { dest: string; reason: string; when: 'now' | 'window'; window: string; notify: boolean; ack: boolean; typed: string; simulateFailure: boolean }
type Check = { label: string; state: 'pass' | 'warn' | 'fail'; detail: string };

function preflight(s: Service, src: InfraNode, dst: InfraNode | undefined): Check[] {
  if (!dst) return [];
  const cap = nodeCapacity(dst);
  const ramOk = cap.ramFreeSellable >= s.resources.memoryMb, diskOk = cap.diskFreeSellable >= s.resources.diskMb;
  const afterRam = Math.round(((dst.allocated.ramMb + s.resources.memoryMb) / dst.hardware.ramMb) * 100);
  return [
    { label: 'Destination accepts new allocations', state: dst.maintenance.enabled ? 'fail' : 'pass', detail: dst.maintenance.enabled ? `${dst.name} is in maintenance/drain` : 'Not in maintenance' },
    { label: 'Destination health', state: dst.health === 'healthy' ? 'pass' : dst.health === 'degraded' ? 'warn' : 'fail', detail: `${dst.name} is ${dst.health}` },
    { label: 'RAM capacity (sold)', state: !ramOk ? 'fail' : afterRam > 90 ? 'warn' : 'pass', detail: `Needs ${mb(s.resources.memoryMb)}; ${mb(cap.ramFreeSellable)} sellable left → ${afterRam}% sold after move` },
    { label: 'Disk capacity (sold)', state: diskOk ? 'pass' : 'fail', detail: `Needs ${mb(s.resources.diskMb)}; ${mb(cap.diskFreeSellable)} sellable left` },
    { label: 'Egg / image available on destination', state: 'pass', detail: 'Same Wings version family; image already pulled' },
    { label: 'Free port allocation', state: 'pass', detail: 'A free allocation exists on the destination IP pool' },
    { label: 'Region change', state: src.region === dst.region ? 'pass' : 'warn', detail: src.region === dst.region ? 'Same region: IP changes, latency does not' : `${REGION_NAMES[src.region]} → ${REGION_NAMES[dst.region]}: latency and IP will change for players` },
    { label: 'Recent backup', state: s.resources.backups > 0 ? 'pass' : 'warn', detail: s.resources.backups > 0 ? 'Latest backup 6 h old (preview assumption)' : 'Plan has no backup slots: no safety copy before the move' },
  ];
}

const STEPS_RUN = ['Lock service (block power actions)', 'Stop server and flush world', 'Snapshot data on source', 'Transfer data to destination', 'Create server on destination', 'Switch allocation and DNS target', 'Start and verify on destination', 'Release source allocation'];

export default function MigrationWizard({ id }: { id: string }) {
  const { data, patch, audit, add, newId } = useAdmin();
  const nav = useNav();
  const toast = useToast();
  const { can, stepUpValid, grantStepUp, role } = useSession();
  const s = data.services.find((x) => x.id === id);
  const src = data.nodes.find((n) => n.id === s?.nodeId);
  const [v, setV] = useState<V>({ dest: '', reason: '', when: 'window', window: 'tonight', notify: true, ack: false, typed: '', simulateFailure: false });
  const [phase, setPhase] = useState<'form' | 'run' | 'done' | 'failed'>('form');
  const [tick, setTick] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const failAt = 3;
  useEffect(() => {
    if (phase !== 'run') return;
    timer.current = window.setInterval(() => setTick((t) => t + 1), 1100);
    return () => window.clearInterval(timer.current);
  }, [phase]);
  const finishOk = () => {
    if (!s || !src) return;
    const dst = data.nodes.find((n) => n.id === v.dest)!;
    patch('services', s.id, { nodeId: dst.id, region: dst.region, ip: dst.publicIp, runtime: 'running' });
    patch('nodes', src.id, (c) => ({ allocated: { ramMb: c.allocated.ramMb - s.resources.memoryMb, diskMb: c.allocated.diskMb - s.resources.diskMb, cpuPct: c.allocated.cpuPct - s.resources.cpuPct } }));
    patch('nodes', dst.id, (c) => ({ allocated: { ramMb: c.allocated.ramMb + s.resources.memoryMb, diskMb: c.allocated.diskMb + s.resources.diskMb, cpuPct: c.allocated.cpuPct + s.resources.cpuPct } }));
    add('jobs', { id: newId('job'), type: 'MIGRATE_SERVICE', status: 'completed', attempts: 1, maxAttempts: 3, correlationId: newId('cor'), idempotencyKey: `migrate:${s.id}:${dst.id}`, orderId: null, serviceId: s.id, customerId: s.customerId, nodeId: dst.id, error: null, unknownOutcome: false, createdAt: iso(0), startedAt: iso(0), finishedAt: iso(60_000), nextRetryAt: null, workerId: 'wrk_preview', logs: [{ at: iso(0), level: 'info', message: `Migrated ${s.id} ${src.id} → ${dst.id} (preview)` }] });
    audit('service.migrated', { type: 'service', id: s.id, label: s.name }, { accountId: s.customerId, reason: v.reason, before: { node: src.id }, after: { node: dst.id } });
  };
  const failing = phase === 'run' && v.simulateFailure && tick > failAt;
  useEffect(() => {
    if (phase !== 'run') return;
    if (failing) { setPhase('failed'); audit('service.migration_rolled_back', { type: 'service', id: id, label: s?.name }, { accountId: s?.customerId ?? null, reason: v.reason, result: 'failed' }); toast({ tone: 'warn', title: 'Migration failed and rolled back (preview)' }); }
    else if (tick >= STEPS_RUN.length) { finishOk(); setPhase('done'); toast({ tone: 'good', title: 'Migration completed (preview)' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, phase]);

  const dst = data.nodes.find((n) => n.id === v.dest);
  const checks = useMemo(() => (s && src ? preflight(s, src, dst) : []), [s, src, dst]);
  if (!s || !src) return <AdminPage title="Service not found"><EmptyState title="No such service" action={<Button onClick={() => nav('/services')}>Back to services</Button>} /></AdminPage>;
  if (!can('services:manage')) return <AdminPage title="Migrate service" detail parents={[{ label: s.name, to: `/services/${s.id}` }]}><Notice tone="warn" title="Role cannot migrate services">Migration requires <code className="font-mono font-bold">services:manage</code> (role {role}).</Notice></AdminPage>;
  if (s.lifecycle !== 'ACTIVE') return <AdminPage title="Migrate service" detail parents={[{ label: s.name, to: `/services/${s.id}` }]}><Notice tone="warn" title="Only active services can be migrated">This contract is {s.lifecycle.toLowerCase().replace('_', ' ')}. Unsuspend it first.</Notice></AdminPage>;

  const downtimeMin = Math.max(2, Math.round((s.usage.diskMb / 1024 / 6) + 1));
  const candidates = data.nodes.filter((n) => n.id !== src.id);
  const runSteps: TaskStep[] = STEPS_RUN.map((l, i) => ({ id: String(i), label: l, state: phase === 'failed' ? (i < failAt ? 'done' : i === failAt ? 'failed' : 'skipped') : tick > i ? 'done' : tick === i ? 'running' : 'pending', ...(phase === 'failed' && i === failAt ? { detail: 'Checksum mismatch after transfer. Destination copy discarded; source untouched.' } : {}) }));
  const steps: WizardStep<V>[] = [
    { id: 'dest', title: 'Choose destination', label: 'Destination', description: `Moving ${s.name} from ${src.name}.`,
      validate: (x) => ({ ...(!x.dest ? { dest: 'Pick a destination node.' } : {}), ...(x.reason.trim().length < 8 ? { reason: 'Give a reason of at least 8 characters.' } : {}) }),
      content: ({ values, set, errors }) => <div className="grid gap-4"><Select label="Destination node" value={values.dest || null} error={errors['dest']} placeholder="Choose a node" onValueChange={(x) => set('dest', x ?? '')} options={candidates.map((n) => { const c = nodeCapacity(n); return { value: n.id, label: `${n.name} · ${REGION_NAMES[n.region]}`, description: `${n.health}${n.maintenance.enabled ? ', maintenance' : ''} · ${c.ramSoldPct}% RAM sold`, disabled: n.maintenance.enabled }; })} /><Textarea label="Reason (audit log)" value={values.reason} onChange={(e) => set('reason', e.target.value)} error={errors['reason']} rows={3} maxLength={300} counter /></div> },
    { id: 'pre', title: 'Preflight checks', label: 'Preflight', description: 'Capacity, compatibility and risk. Failed checks block the move.',
      validate: () => (checks.some((c) => c.state === 'fail') ? { checks: 'Resolve failed checks or choose another node.' } : undefined),
      content: ({ errors }) => <div className="grid gap-3">{errors['checks'] ? <Notice tone="bad" title="Blocked">{errors['checks']}</Notice> : null}<ul className="grid gap-2" aria-label="Preflight results">{checks.map((c) => <li key={c.label} className="flex items-start justify-between gap-3 rounded-md bg-s2 p-3"><span><b>{c.label}</b><span className="block text-[13.5px] text-ink2">{c.detail}</span></span><StatusBadge tone={c.state === 'pass' ? 'good' : c.state === 'warn' ? 'warn' : 'bad'}>{c.state === 'pass' ? 'Pass' : c.state === 'warn' ? 'Warning' : 'Fail'}</StatusBadge></li>)}</ul></div> },
    { id: 'when', title: 'Downtime and schedule', label: 'Schedule', description: `Estimated downtime about ${downtimeMin} minutes (${mb(s.usage.diskMb)} to copy).`,
      content: ({ values, set }) => <div className="grid gap-4"><RadioGroup legend="When should the move start?" value={values.when} onValueChange={(x) => set('when', x as V['when'])} options={[{ value: 'window', label: 'In a maintenance window', description: 'Recommended. Players get notice first.' }, { value: 'now', label: 'As soon as confirmed', description: 'Server goes offline immediately.' }]} />{values.when === 'window' ? <Select label="Window" value={values.window} onValueChange={(x) => set('window', x ?? 'tonight')} options={[{ value: 'tonight', label: 'Tonight 03:00–04:00 UTC (lowest player count)' }, { value: 'weekend', label: 'Saturday 02:00–03:00 UTC' }]} /> : null}<Checkbox label="Email the customer before and after" checked={values.notify} onCheckedChange={(x) => set('notify', x)} /></div> },
    { id: 'confirm', title: 'Confirm', label: 'Confirm', description: 'Review and confirm. This is a preview: no node is touched.',
      validate: (x) => ({ ...(!x.ack ? { ack: 'Confirm that you understand the downtime.' } : {}), ...(x.typed !== s.name ? { typed: `Type ${s.name} to confirm.` } : {}), ...(!stepUpValid ? { stepUp: 'Step-up verification is required.' } : {}) }),
      content: ({ values, set, errors }) => <div className="grid gap-4">
        <Notice tone="warn" title="Customer-visible downtime">{s.name} will be offline for roughly {downtimeMin} minutes and may get a new address ({dst?.publicIp}:port).</Notice>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-s2 p-3"><div><p className="font-bold">Step-up verification</p><p className="text-[13px] text-ink3">Required within {STEP_UP_MINUTES} minutes.</p></div>{stepUpValid ? <StatusBadge tone="good">Verified (simulated)</StatusBadge> : <Button size="sm" variant="secondary" onClick={grantStepUp}>Simulate step-up</Button>}</div>
        {errors['stepUp'] ? <p role="alert" className="text-[13px] font-semibold text-bad">{errors['stepUp']}</p> : null}
        <Checkbox label="I understand the downtime and have checked the preflight results" checked={values.ack} onCheckedChange={(x) => set('ack', x)} error={errors['ack']} />
        <TextField label={<>Type <b className="font-mono">{s.name}</b></>} value={values.typed} onChange={(e) => set('typed', e.target.value)} error={errors['typed']} autoComplete="off" />
        <Checkbox label="Preview: simulate a failure during transfer to review rollback" checked={values.simulateFailure} onCheckedChange={(x) => set('simulateFailure', x)} />
      </div> },
  ];

  return (
    <AdminPage detail title={`Migrate ${s.name}`} crumbLabel="Migrate" parents={[{ label: 'Services', to: '/services' }, { label: s.name, to: `/services/${s.id}` }]} description={`Guided move between nodes. Source: ${src.name} (${REGION_NAMES[src.region]}).`} status={<Badge tone="warn">Preview workflow</Badge>}>
      {phase === 'form' ? (
        <FormWizard<V> steps={steps} values={v} onChange={setV} submitLabel="Start migration" onCancel={() => nav(`/services/${s.id}`)} onSubmit={() => { setTick(0); setPhase('run'); }}
          aside={(x) => { const d = data.nodes.find((n) => n.id === x.dest); return <div className="grid gap-4"><Section title="Service"><p className="font-bold">{s.name}</p><p className="text-[13.5px] text-ink2">{s.planName} · {mb(s.resources.memoryMb)} RAM · {mb(s.resources.diskMb)} disk</p></Section>{d ? <Section title="After the move"><CapacityBar label={`${d.name} RAM`} physical={d.hardware.ramMb} sold={d.allocated.ramMb + s.resources.memoryMb} used={d.usage.ramMb} format={mb} /></Section> : <p className="text-[13.5px] text-ink3">Pick a destination to see its capacity.</p>}</div>; }} />
      ) : (
        <Split main={<Section title={phase === 'run' ? 'Migration in progress' : phase === 'done' ? 'Migration completed' : 'Migration failed — rolled back'} description={phase === 'run' ? 'Simulated transitions. Each step would be a job with its own retry and unknown-outcome handling.' : undefined}>
          <TaskProgress steps={runSteps} label="Migration steps" />
          {phase === 'done' ? <div className="mt-4 grid gap-3"><Notice tone="good" title="Service is running on the destination">{s.name} now lives on {dst?.name}. The source allocation was released.</Notice><div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => nav(`/services/${s.id}`)}>Open service</Button><Button variant="secondary" onClick={() => nav('/infrastructure/capacity')}>View capacity</Button></div></div> : null}
          {phase === 'failed' ? <div className="mt-4 grid gap-3"><Notice tone="warn" title="Rolled back to the source node">The destination copy was discarded. {s.name} is still on {src.name} and was restarted. Nothing changed for the customer except the downtime.</Notice><div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => { setPhase('form'); setTick(0); }}>Review and retry</Button><Button variant="secondary" onClick={() => nav(`/services/${s.id}`)}>Back to service</Button></div></div> : null}
        </Section>} aside={<Section title="Summary"><dl className="grid gap-2 text-[14px]"><div className="flex justify-between gap-3"><dt className="text-ink3">From</dt><dd className="font-bold">{src.name}</dd></div><div className="flex justify-between gap-3"><dt className="text-ink3">To</dt><dd className="font-bold">{dst?.name}</dd></div><div className="flex justify-between gap-3"><dt className="text-ink3">Window</dt><dd className="font-bold">{v.when === 'now' ? 'Immediate' : v.window}</dd></div></dl></Section>} />
      )}
      <PreviewNote />
    </AdminPage>
  );
}
