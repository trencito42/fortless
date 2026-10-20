import type { BadgeTone } from '@/design-system';

export interface StatusView { tone: BadgeTone; label: string; live?: boolean }

/** Pterodactyl power states plus the Fortless "installing" and "suspended" overlays. */
export type ServerState = 'running' | 'starting' | 'stopping' | 'offline' | 'installing' | 'suspended' | 'error' | 'unknown';
export const serverStatus: Record<ServerState, StatusView> = {
  running: { tone: 'good', label: 'Running', live: true },
  starting: { tone: 'warn', label: 'Starting', live: true },
  stopping: { tone: 'warn', label: 'Stopping', live: true },
  offline: { tone: 'neutral', label: 'Offline' },
  installing: { tone: 'info', label: 'Installing', live: true },
  suspended: { tone: 'bad', label: 'Suspended' },
  error: { tone: 'bad', label: 'Error' },
  unknown: { tone: 'neutral', label: 'Unknown' },
};

export type InvoiceState = 'paid' | 'open' | 'overdue' | 'void' | 'refunded' | 'draft';
export const invoiceStatus: Record<InvoiceState, StatusView> = {
  paid: { tone: 'good', label: 'Paid' }, open: { tone: 'warn', label: 'Due' }, overdue: { tone: 'bad', label: 'Overdue' },
  void: { tone: 'neutral', label: 'Void' }, refunded: { tone: 'info', label: 'Refunded' }, draft: { tone: 'neutral', label: 'Draft' },
};

export type DomainState = 'active' | 'pending' | 'expiring' | 'expired' | 'transfer';
export const domainStatus: Record<DomainState, StatusView> = {
  active: { tone: 'good', label: 'Active' }, pending: { tone: 'warn', label: 'Pending DNS', live: true }, expiring: { tone: 'warn', label: 'Expiring soon' },
  expired: { tone: 'bad', label: 'Expired' }, transfer: { tone: 'info', label: 'Transferring', live: true },
};

export type TicketState = 'open' | 'waiting' | 'answered' | 'closed';
export const ticketStatus: Record<TicketState, StatusView> = {
  open: { tone: 'accent', label: 'Open' }, waiting: { tone: 'warn', label: 'Waiting on you' }, answered: { tone: 'info', label: 'Answered' }, closed: { tone: 'neutral', label: 'Closed' },
};

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed';
export const jobStatus: Record<JobState, StatusView> = {
  queued: { tone: 'neutral', label: 'Queued' }, running: { tone: 'accent', label: 'Running', live: true }, succeeded: { tone: 'good', label: 'Done' }, failed: { tone: 'bad', label: 'Failed' },
};
