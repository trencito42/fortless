export interface AuditRowLike {
  actor_user_id?: string | null;
  actor_type?: string | null;
  actor_name?: string | null;
  ip_address?: string | null;
  metadata?: string | null;
}

/**
 * NEW-399: what a workspace member may see of an audit event. Staff actions keep their name and time but never their
 * internal notes (reasons, fraud remarks), and other people's IP addresses are not shown.
 */
export function customerAuditView<T extends AuditRowLike>(row: T, viewerUserId: string): T {
  const own = row.actor_user_id === viewerUserId;
  const staff = row.actor_type === 'STAFF';
  return {
    ...row,
    actor_name: staff ? 'Fortless staff' : row.actor_name,
    actor_user_id: staff ? null : row.actor_user_id,
    ip_address: own ? row.ip_address : null,
    metadata: staff ? '{}' : row.metadata,
  };
}
