import { useState } from 'react';
import { Card, CardHeader, LoadingButton, RadioCardGroup, Select, Switch, TagInput, SegmentedControl, TextField, KeyValueEditor, type ChoiceOption, type KeyValueRow } from '@/design-system';

export interface DeployPlan { id: string; name: string; specs: string; /** Already formatted by the app, e.g. "€6.00 / month". Pricing is never computed here. */ price: string; disabled?: boolean; disabledReason?: string }
export interface DeployRegion { id: string; name: string; unavailable?: boolean }
export interface DeployValue { mode: 'quick' | 'custom'; name: string; planId: string; regionId: string; env: KeyValueRow[]; /** Custom only. */ startupCommand: string; extraPorts: string[]; autoRestart: boolean }

export interface DeployConfiguratorProps {
  product: { id: string; name: string };
  plans: DeployPlan[];
  regions: DeployRegion[];
  onDeploy: (value: DeployValue) => Promise<void>;
}

/**
 * Deploy form with a Quick path (name, plan, region) and a Custom path that adds startup command, extra ports, auto-restart and environment variables.
 * Quick hides the custom fields and submits their defaults (empty command, no extra ports, auto-restart on, no variables), so switching modes never loses what was typed.
 * Capacity is dedicated per plan, so the form never shows a "shared pool" and never estimates availability: plans and regions
 * arrive already filtered, with reasons for anything disabled.
 */
export function DeployConfigurator({ product, plans, regions, onDeploy }: DeployConfiguratorProps) {
  const [v, setV] = useState<DeployValue>({ mode: 'quick', name: '', planId: '', regionId: regions.find((r) => !r.unavailable)?.id ?? '', env: [], startupCommand: '', extraPorts: [], autoRestart: true });
  const [err, setErr] = useState<{ name?: string; plan?: string; ports?: string; submit?: string }>({});
  const plan = plans.find((p) => p.id === v.planId);

  const submit = async () => {
    const e: typeof err = {};
    if (v.name.trim().length < 3) e.name = 'Use at least 3 characters.';
    if (!v.planId) e.plan = 'Choose a plan.';
    if (v.mode === 'custom') {
      const bad = v.extraPorts.find((x) => !/^\d+$/.test(x) || Number(x) < 1024 || Number(x) > 65535);
      if (bad) e.ports = `"${bad}" is not a valid port. Use numbers from 1024 to 65535.`;
    }
    setErr(e);
    if (e.name || e.plan || e.ports) return;
    const payload: DeployValue = v.mode === 'quick' ? { ...v, env: [], startupCommand: '', extraPorts: [], autoRestart: true } : v;
    try { await onDeploy(payload); } catch (x) { setErr({ submit: x instanceof Error ? x.message : 'Could not deploy. Try again.' }); }
  };

  const options: ChoiceOption[] = plans.map((p) => ({ value: p.id, label: p.name, description: p.disabled ? p.disabledReason ?? 'Unavailable' : p.specs, meta: p.price, disabled: p.disabled }));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader title={`Deploy ${product.name}`} actions={<SegmentedControl aria-label="Setup mode" size="sm" value={v.mode} onValueChange={(m) => setV({ ...v, mode: m })} options={[{ value: 'quick', label: 'Quick' }, { value: 'custom', label: 'Custom' }]} />} />
        <div className="grid gap-5">
          <TextField label="Name" description="Only visible to you." value={v.name} onChange={(e) => { setV({ ...v, name: e.target.value }); setErr({ ...err, name: undefined }); }} error={err.name} />
          <RadioCardGroup legend="Plan" options={options} value={v.planId} onValueChange={(id) => { setV({ ...v, planId: id }); setErr({ ...err, plan: undefined }); }} error={err.plan} columns={2} />
          <Select label="Region" value={v.regionId} onValueChange={(id) => setV({ ...v, regionId: id ?? '' })} options={regions.map((r) => ({ value: r.id, label: r.unavailable ? `${r.name} (unavailable)` : r.name, disabled: r.unavailable }))} />
          {v.mode === 'custom' ? (
            <>
              <TextField label="Startup command" description="Leave empty to use the product default." placeholder="java -Xms1G -Xmx2G -jar server.jar" value={v.startupCommand} onChange={(e) => setV({ ...v, startupCommand: e.target.value })} />
              <TagInput label="Extra ports" description="Press Enter after each port. Range 1024–65535." value={v.extraPorts} onValueChange={(extraPorts) => { setV({ ...v, extraPorts }); setErr({ ...err, ports: undefined }); }} error={err.ports} />
              <Switch label="Restart automatically" description="Start the server again if it stops unexpectedly." checked={v.autoRestart} onCheckedChange={(autoRestart) => setV({ ...v, autoRestart })} />
            </>
          ) : null}
          {v.mode === 'custom' ? <KeyValueEditor legend="Environment variables" description="Available to the process at start." rows={v.env} onRowsChange={(env) => setV({ ...v, env })} pasteLines allowSecret /> : null}
        </div>
      </Card>
      <Card surface="sunken" className="h-fit">
        <h3 className="text-lg font-extrabold tracking-[-0.03em]">Summary</h3>
        <dl className="mt-3 grid gap-2 text-[14px]">
          <div className="flex justify-between gap-3"><dt className="text-ink3">Product</dt><dd className="font-bold">{product.name}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink3">Plan</dt><dd className="font-bold">{plan?.name ?? '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink3">Region</dt><dd className="font-bold">{regions.find((r) => r.id === v.regionId)?.name ?? '—'}</dd></div>
          {v.mode === 'custom' ? <div className="flex justify-between gap-3"><dt className="text-ink3">Auto-restart</dt><dd className="font-bold">{v.autoRestart ? 'On' : 'Off'}</dd></div> : null}
          <div className="flex justify-between gap-3 pt-2 text-[16px]"><dt className="font-bold">Price</dt><dd className="font-extrabold">{plan?.price ?? '—'}</dd></div>
        </dl>
        {err.submit ? <p role="alert" className="mt-3 rounded-md bg-bad-bg px-3 py-2 font-semibold text-bad">{err.submit}</p> : null}
        <LoadingButton block size="lg" variant="primary" leadingIcon="rocket-01" className="mt-4" onClick={submit}>Deploy</LoadingButton>
      </Card>
    </div>
  );
}
