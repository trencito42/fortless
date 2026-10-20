import { ActionMenu, AlertDialog, Button, Card, CardHeader, DescriptionList, StatusBadge } from '@/design-system';

export interface Subscription { id: string; planName: string; price: string; renewsOn?: string; endsOn?: string; state: 'active' | 'cancel-scheduled' | 'past-due' | 'paused'; paymentMethod?: string }

export interface SubscriptionActionsProps {
  subscription: Subscription;
  onChangePlan: () => void;
  onUpdatePayment: () => void;
  /** Schedules cancellation at period end. Must be reversible via onResume until then. */
  onCancel: () => Promise<void>;
  onResume: () => Promise<void>;
}

/** Plan summary with the actions that change billing. Cancel is a typed-confirmation dialog that states what is kept and until when. */
export function SubscriptionActions({ subscription: s, onChangePlan, onUpdatePayment, onCancel, onResume }: SubscriptionActionsProps) {
  const tone = s.state === 'active' ? 'good' : s.state === 'past-due' ? 'bad' : 'warn';
  const label = { active: 'Active', 'cancel-scheduled': 'Cancels at period end', 'past-due': 'Payment failed', paused: 'Paused' }[s.state];
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title={s.planName} description={s.price} actions={<StatusBadge tone={tone}>{label}</StatusBadge>} />
      <DescriptionList items={[...(s.renewsOn && s.state === 'active' ? [{ label: 'Renews on', value: s.renewsOn }] : []), ...(s.endsOn ? [{ label: 'Ends on', value: s.endsOn }] : []), ...(s.paymentMethod ? [{ label: 'Payment method', value: s.paymentMethod }] : [])]} />
      {s.state === 'past-due' ? <p role="alert" className="rounded-md bg-bad-bg px-4 py-2.5 font-semibold text-bad">The last payment failed. Update your payment method to keep your services running.</p> : null}
      <div className="flex flex-wrap gap-2">
        {s.state === 'past-due' ? <Button variant="primary" leadingIcon="credit-card" onClick={onUpdatePayment}>Update payment method</Button> : null}
        {s.state === 'cancel-scheduled' ? <Button variant="primary" onClick={onResume}>Keep my plan</Button> : <Button variant="secondary" onClick={onChangePlan}>Change plan</Button>}
        <ActionMenu label="More billing actions" entries={[{ id: 'pm', label: 'Update payment method', onSelect: onUpdatePayment }]} />
        {s.state === 'active' || s.state === 'past-due' ? (
          <AlertDialog
            trigger={<Button variant="danger-subtle">Cancel plan</Button>}
            title="Cancel this plan?"
            description={`Your services keep running until ${s.endsOn ?? s.renewsOn ?? 'the end of the billing period'}. After that they are suspended. You can undo this before then.`}
            confirmLabel="Cancel plan"
            tone="danger"
            onConfirm={onCancel}
          />
        ) : null}
      </div>
    </Card>
  );
}
