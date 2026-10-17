import { api } from '../api/client.js';

export interface UserIdentity {
  id: string;
  name: string;
  email: string;
  status: string;
}

export interface AccountContext {
  id: string;
  name: string;
  owner_user_id: string;
}

export interface MembershipContext {
  id: string;
  role: string;
}

export interface SessionState {
  user: UserIdentity | null;
  account: AccountContext | null;
  membership: MembershipContext | null;
  staff: {
    role: string;
    permissions: string[];
  } | null;
}

class SessionStore {
  private state: SessionState = {
    user: null,
    account: null,
    membership: null,
    staff: null,
  };

  private listeners: Array<(state: SessionState) => void> = [];

  public getState(): SessionState {
    return this.state;
  }

  public set(state: Partial<SessionState>): void {
    this.state = { ...this.state, ...state };
    this.notify();
  }

  public subscribe(listener: (state: SessionState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  public async loadSession(): Promise<SessionState> {
    const data = await api.get<{
      user: UserIdentity;
      account: AccountContext;
      membership: MembershipContext;
    }>('/api/v1/auth/me');

    this.state.user = data.user;
    this.state.account = data.account;
    this.state.membership = data.membership;

    try {
      const staffRes = await api.get<{
        staff: { role: string; permissions: string[] };
      }>('/api/v1/admin/me');
      this.state.staff = staffRes.staff;
    } catch {
      this.state.staff = null;
    }

    this.notify();
    return this.state;
  }

  public hasPermission(permission: string): boolean {
    if (!this.state.staff) return false;
    if (this.state.staff.role === 'OWNER') return true;
    return this.state.staff.permissions.includes(permission);
  }
}

export const sessionStore = new SessionStore();
