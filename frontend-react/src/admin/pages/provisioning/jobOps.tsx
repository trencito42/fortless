import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { iso } from '../../lib/format';
import type { Job } from '../../types';

/** Retry, cancel and review. A job with an unknown provider outcome can never be retried until reconciliation resolves the outcome. */
export function useJobOps() {
  const { patch, audit } = useAdmin();
  const dlg = useActionDialog();
  const ent = (j: Job) => ({ type: 'job', id: j.id, label: j.type });
  const retryBlocked = (j: Job) => (j.unknownOutcome ? 'Outcome unknown: reconcile with the provider by correlation tag before retrying, otherwise a duplicate server may be created.' : j.status === 'completed' ? 'Job already completed' : j.status === 'running' ? 'Job is running' : null);
  const retry = (j: Job) => dlg.run({ title: 'Retry job', description: 'Queues another attempt with the same idempotency key. Nothing is created twice.', confirmLabel: 'Retry job', permission: 'services:manage', stepUp: true, reasonRequired: true, effects: ['Set the job back to pending', 'Worker re-checks provider state by correlation tag before acting', `Attempt ${j.attempts + 1} of ${Math.max(j.maxAttempts, j.attempts + 1)}`],
    onConfirm: ({ reason }) => { patch('jobs', j.id, (c) => ({ status: 'pending' as const, error: null, nextRetryAt: iso(60_000), maxAttempts: Math.max(c.maxAttempts, c.attempts + 1), finishedAt: null })); audit('job.retried', ent(j), { reason }); return 'Job queued for retry'; } });
  const cancel = (j: Job) => dlg.run({ title: 'Cancel job', description: 'Only pending jobs can be canceled. The related order stays as it is.', confirmLabel: 'Cancel job', permission: 'services:manage', tone: 'danger', reasonRequired: true, onConfirm: ({ reason }) => { patch('jobs', j.id, { status: 'dead_letter', error: { code: 'CANCELED_BY_STAFF', message: reason } }); audit('job.canceled', ent(j), { reason }); return 'Job canceled'; } });
  const review = (j: Job) => dlg.run({ title: 'Send to manual review', description: 'Stops automatic retries and puts the job in the manual-review queue.', confirmLabel: 'Move to review', permission: 'services:manage', reasonRequired: true, onConfirm: ({ reason }) => { patch('jobs', j.id, { status: 'manual_review' }); audit('job.manual_review', ent(j), { reason }); return 'Job moved to manual review'; } });
  const resolveUnknown = (j: Job) => dlg.run({ title: 'Resolve unknown outcome', description: 'Looks up provider servers by the deterministic correlation tag. Never creates anything.', confirmLabel: 'Query provider', permission: 'services:manage', stepUp: true, reasonRequired: true, effects: ['Search provider by tag', 'Exactly one match: link it and complete the job', 'No match: clear the unknown flag so a retry is safe'], onConfirm: ({ reason }) => { patch('jobs', j.id, { unknownOutcome: false, error: { code: 'NO_PROVIDER_SERVER', message: 'Tag lookup found no server; retry is safe.' } }); audit('job.outcome_resolved', ent(j), { reason }); return 'Outcome resolved: no provider server exists, retry is now safe'; } });
  return { node: dlg.node, retry, cancel, review, resolveUnknown, retryBlocked };
}
