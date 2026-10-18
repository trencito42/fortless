import { api } from '../api/client.js';

export interface CapabilitiesState {
  payments: {
    enabled: boolean;
    mode: string;
    details?: string;
  };
  provisioning: {
    enabled: boolean;
    mode: string;
    details?: string;
  };
  panelSso?: {
    enabled: boolean;
  };
  email?: {
    enabled: boolean;
    mode: string;
  };
}

class CapabilitiesStore {
  private capabilities: CapabilitiesState | null = null;

  public async load(): Promise<CapabilitiesState> {
    try {
      this.capabilities = await api.get<CapabilitiesState>('/api/v1/platform/capabilities');
    } catch {
      this.capabilities = {
        payments: { enabled: false, mode: 'disabled' },
        provisioning: { enabled: false, mode: 'disabled' },
      };
    }
    return this.capabilities;
  }

  public set(caps: CapabilitiesState): void {
    this.capabilities = caps;
  }

  public get(): CapabilitiesState | null {
    return this.capabilities;
  }

  public isCommerceReady(): boolean {
    return Boolean(this.capabilities?.payments?.enabled && this.capabilities?.provisioning?.enabled);
  }
}

export const capabilitiesStore = new CapabilitiesStore();
