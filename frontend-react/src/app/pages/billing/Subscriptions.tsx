import { useState } from 'react';
import { Notice } from '@/design-system';
import { SubscriptionActions } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { useNavigate } from '../../router';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { date, money } from '../../format';

export default function Subscriptions() {
  const api = useApi(); const nav = useNavigate();
  const res = useApiQuery((a) => a.listSubscriptions());
  const [err, setErr] = useState<string>();
  const guard = (fn: () => Promise<void>) => async () => { setErr(undefined); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'That did not work.'); } };
  return (
    <div className="grid gap-5">
      <PageHeader title="Subscriptions" description="One per service. Cancelling stops renewal; you keep the service until the paid period ends." crumbs={[{ label: 'Billing', to: '/app/billing' }, { label: 'Subscriptions' }]} />
      <CapabilityNote area="billing" />
      {err ? <Notice tone="bad">{err}</Notice> : null}
      <ResourceView res={res} reload={res.reload} label="Loading subscriptions">
        {(list) => (
          <ul className="grid gap-4 lg:grid-cols-2">
            {list.map((s) => (
              <li key={s.id} className="grid gap-3">
                <SubscriptionActions
                  subscription={{ id: s.id, planName: `${s.serviceName} · ${s.planName}`, price: `${money(s.price)} / ${s.cycle === 'yearly' ? 'year' : 'month'}`, renewsOn: s.renewsOn ? date(s.renewsOn) : undefined, endsOn: s.endsOn ? date(s.endsOn) : undefined, state: s.state }}
                  onChangePlan={() => nav('/app/billing/plans')} onUpdatePayment={() => nav('/app/billing/payment-methods')}
                  onCancel={guard(() => api.cancelSubscription(s.id))} onResume={guard(() => api.resumeSubscription(s.id))}
                />
                <p className="px-1 text-[13px] text-ink3">Billing cycle: <span className="font-bold">{s.cycle}</span>. Cycle changes are not exposed by the backend.</p>
              </li>
            ))}
          </ul>
        )}
      </ResourceView>
    </div>
  );
}
