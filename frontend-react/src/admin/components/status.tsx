import { StatusBadge, type BadgeTone } from '@/design-system';
import type { Invoice } from '../types';
import { ADMIN_NOW } from '../lib/format';

export interface StatusView { tone: BadgeTone; label: string; live?: boolean }
type StatusMap = Record<string, StatusView>;
const v = (tone: BadgeTone, label: string, live?: boolean): StatusView => (live ? { tone, label, live } : { tone, label });

export const accountStatus: StatusMap = { ACTIVE: v('good', 'Active'), PENDING_VERIFICATION: v('info', 'Pending verification'), RESTRICTED: v('warn', 'Restricted'), SUSPENDED: v('bad', 'Suspended'), CLOSED: v('neutral', 'Closed') };
export const riskLevel: StatusMap = { low: v('good', 'Low risk'), medium: v('warn', 'Medium risk'), high: v('bad', 'High risk') };
export const lifecycle: StatusMap = { ACTIVE: v('good', 'Active'), PAST_DUE: v('warn', 'Past due'), SUSPENDED: v('warn', 'Suspended'), CANCELLED: v('neutral', 'Cancelled'), TERMINATED: v('bad', 'Terminated') };
export const runtime: StatusMap = { running: v('good', 'Running', true), offline: v('neutral', 'Offline'), starting: v('warn', 'Starting', true), stopping: v('warn', 'Stopping', true), installing: v('info', 'Installing', true), error: v('bad', 'Error'), unknown: v('neutral', 'Unknown') };
export const providerSync: StatusMap = { in_sync: v('good', 'In sync'), drift: v('warn', 'State drift'), missing_remote: v('bad', 'Missing at provider'), unlinked: v('warn', 'Not linked') };
export const orderStatus: StatusMap = {
  DRAFT: v('neutral', 'Draft'), AWAITING_PAYMENT: v('warn', 'Awaiting payment'), PAID: v('info', 'Paid'), FULFILLING: v('info', 'Fulfilling', true), COMPLETED: v('good', 'Completed'),
  PARTIALLY_FULFILLED: v('warn', 'Partially fulfilled'), FULFILLMENT_FAILED: v('bad', 'Fulfillment failed'), CANCELED: v('neutral', 'Canceled'),
};
export const paymentState: StatusMap = { none: v('neutral', 'No payment'), processing: v('info', 'Processing', true), succeeded: v('good', 'Paid'), failed: v('bad', 'Failed'), refunded: v('info', 'Refunded'), partially_refunded: v('info', 'Partly refunded'), disputed: v('bad', 'Disputed') };
export const fulfillmentState: StatusMap = { not_started: v('neutral', 'Not started'), queued: v('info', 'Queued'), in_progress: v('info', 'In progress', true), completed: v('good', 'Delivered'), partial: v('warn', 'Partial'), failed: v('bad', 'Failed') };
export const invoiceStatus: StatusMap = { DRAFT: v('neutral', 'Draft'), OPEN: v('warn', 'Open'), OVERDUE: v('bad', 'Overdue'), PAID: v('good', 'Paid'), VOID: v('neutral', 'Void'), UNCOLLECTIBLE: v('bad', 'Uncollectible') };
export const invoiceKey = (i: Pick<Invoice, 'status' | 'dueAt'>) => (i.status === 'OPEN' && Date.parse(i.dueAt) < ADMIN_NOW ? 'OVERDUE' : i.status);
export const paymentStatus: StatusMap = { succeeded: v('good', 'Succeeded'), failed: v('bad', 'Failed'), pending: v('info', 'Pending', true), refunded: v('info', 'Refunded'), partially_refunded: v('info', 'Partly refunded'), disputed: v('bad', 'Disputed') };
export const refundStatus: StatusMap = { pending_approval: v('warn', 'Awaiting approval'), approved: v('info', 'Approved'), processed: v('good', 'Processed'), rejected: v('neutral', 'Rejected'), failed: v('bad', 'Failed') };
export const subscriptionStatus: StatusMap = { ACTIVE: v('good', 'Active'), GRACE: v('warn', 'In grace'), PAST_DUE: v('bad', 'Past due'), CANCEL_AT_PERIOD_END: v('warn', 'Ends at period end'), CANCELED: v('neutral', 'Canceled') };
export const nodeHealth: StatusMap = { healthy: v('good', 'Healthy'), degraded: v('warn', 'Degraded'), offline: v('bad', 'Offline') };
export const jobStatus: StatusMap = { pending: v('neutral', 'Pending'), running: v('info', 'Running', true), completed: v('good', 'Completed'), failed: v('bad', 'Failed'), dead_letter: v('bad', 'Dead letter'), manual_review: v('warn', 'Manual review') };
export const webhookStatus: StatusMap = { received: v('info', 'Received'), processed: v('good', 'Processed'), failed: v('bad', 'Failed'), duplicate: v('neutral', 'Duplicate'), pending_review: v('warn', 'Pending review') };
export const workerStatus: StatusMap = { idle: v('neutral', 'Idle'), busy: v('info', 'Busy', true), stalled: v('bad', 'Stalled'), stopped: v('neutral', 'Stopped') };
export const priority: StatusMap = { critical: v('bad', 'Critical'), high: v('warn', 'High'), medium: v('info', 'Medium'), low: v('neutral', 'Low'), urgent: v('bad', 'Urgent'), normal: v('neutral', 'Normal') };
export const actionStatus: StatusMap = { open: v('warn', 'Open'), acknowledged: v('info', 'Acknowledged'), resolved: v('good', 'Resolved') };
export const componentHealth: StatusMap = { operational: v('good', 'Operational'), degraded: v('warn', 'Degraded performance'), partial_outage: v('warn', 'Partial outage'), major_outage: v('bad', 'Major outage'), maintenance: v('info', 'Under maintenance') };
export const incidentStatus: StatusMap = { investigating: v('bad', 'Investigating'), identified: v('warn', 'Identified'), monitoring: v('info', 'Monitoring'), resolved: v('good', 'Resolved') };
export const severity: StatusMap = { minor: v('neutral', 'Minor'), major: v('warn', 'Major'), critical: v('bad', 'Critical'), info: v('info', 'Info'), warning: v('warn', 'Warning'), maintenance: v('info', 'Maintenance') };
export const maintenanceStatus: StatusMap = { scheduled: v('info', 'Scheduled'), in_progress: v('warn', 'In progress', true), completed: v('good', 'Completed'), cancelled: v('neutral', 'Cancelled') };
export const ticketStatus: StatusMap = { open: v('warn', 'Open'), waiting_customer: v('info', 'Waiting on customer'), waiting_staff: v('bad', 'Waiting on staff'), resolved: v('good', 'Resolved'), closed: v('neutral', 'Closed') };
export const planStatus: StatusMap = { DRAFT: v('neutral', 'Draft'), ACTIVE: v('good', 'Active'), RETIRED: v('neutral', 'Retired') };
export const contentStatus: StatusMap = { draft: v('neutral', 'Draft'), published: v('good', 'Published'), archived: v('neutral', 'Archived'), scheduled: v('info', 'Scheduled'), expired: v('neutral', 'Expired'), running: v('good', 'Running'), paused: v('warn', 'Paused'), completed: v('neutral', 'Completed') };
export const staffStatus: StatusMap = { ACTIVE: v('good', 'Active'), REVOKED: v('neutral', 'Revoked') };
export const approvalStatus: StatusMap = { pending: v('warn', 'Pending'), approved: v('good', 'Approved'), rejected: v('bad', 'Rejected'), expired: v('neutral', 'Expired') };
export const auditResult: StatusMap = { success: v('good', 'Success'), denied: v('warn', 'Denied'), failed: v('bad', 'Failed') };
export const connectionHealth: StatusMap = { connected: v('good', 'Connected'), degraded: v('warn', 'Degraded'), error: v('bad', 'Error'), not_configured: v('neutral', 'Not configured') };
export const emailStatus: StatusMap = { sent: v('good', 'Sent'), failed: v('bad', 'Failed'), bounced: v('bad', 'Bounced'), queued: v('info', 'Queued') };

/** Renders a status from one of the maps above. Unknown values render as neutral text instead of throwing. */
export function Status({ map, value, label }: { map: StatusMap; value: string; label?: string }) {
  const s = map[value] ?? v('neutral', value);
  return <StatusBadge tone={s.tone} live={s.live}>{label ?? s.label}</StatusBadge>;
}
