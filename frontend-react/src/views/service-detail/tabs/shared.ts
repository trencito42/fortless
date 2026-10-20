import type { MutationDto } from '../contracts';
import type { OpResult } from '@/features';

/** `pending` = the panel did not answer in time. The kit shows "result unknown" instead of success or a retryable failure. */
export const pend = (r: Pick<MutationDto, 'pending'> | undefined): OpResult => (r?.pending ? 'pending' : undefined);
