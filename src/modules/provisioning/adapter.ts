export interface ProvisioningSpec {
  serviceId: string;
  name: string;
  memoryMb: number;
  cpuPct: number;
  diskMb: number;
  databases: number;
  backups: number;
  eggId: number;
  dockerImage?: string;
  startupCommand?: string;
  environmentVariables: Record<string, string>;
  correlationTag: string;
}

export interface ObservedResource {
  externalId: string;
  identifier: string;
  name: string;
  status: 'RUNNING' | 'STOPPED' | 'INSTALLING' | 'ERROR';
  nodeId: string;
  limits: {
    memoryMb: number;
    cpuPct: number;
    diskMb: number;
  };
}

export interface ProviderAdapter {
  readonly providerType: 'PTERODACTYL' | 'CPANEL' | 'REGISTRAR' | 'VPS';
  readonly version: string;

  provision(spec: ProvisioningSpec): Promise<{ externalId: string; identifier: string }>;
  lookupByCorrelationTag(tag: string): Promise<ObservedResource | null>;
  powerAction(externalId: string, action: 'START' | 'STOP' | 'RESTART' | 'KILL'): Promise<void>;
  suspend(externalId: string): Promise<void>;
  unsuspend(externalId: string): Promise<void>;
  terminate(externalId: string): Promise<void>;
}

/**
 * In-memory Mock Provider Adapter for testing, development, and fault-injection simulations.
 * Accurately models Pterodactyl 1.x behavior, including timeout simulation.
 */
export class MockPterodactylAdapter implements ProviderAdapter {
  readonly providerType = 'PTERODACTYL' as const;
  readonly version = '1.11.x-MOCK';

  private servers = new Map<string, ObservedResource & { correlationTag: string }>();
  public simulateTimeoutOnNextProvision = false;
  public simulate500OnNextProvision = false;

  async provision(spec: ProvisioningSpec): Promise<{ externalId: string; identifier: string }> {
    if (this.simulate500OnNextProvision) {
      this.simulate500OnNextProvision = false;
      throw new Error('Pterodactyl 500 Internal Server Error (Simulated)');
    }

    const externalId = `ptla_${Math.floor(1000 + Math.random() * 9000)}`;
    const identifier = externalId.slice(-8);

    const resource: ObservedResource & { correlationTag: string } = {
      externalId,
      identifier,
      name: spec.name,
      status: 'RUNNING',
      nodeId: 'node_fra_01',
      limits: {
        memoryMb: spec.memoryMb,
        cpuPct: spec.cpuPct,
        diskMb: spec.diskMb,
      },
      correlationTag: spec.correlationTag,
    };

    // Store server in provider state
    this.servers.set(externalId, resource);

    if (this.simulateTimeoutOnNextProvision) {
      this.simulateTimeoutOnNextProvision = false;
      // Server was created on provider, but the connection to client was severed!
      throw new Error('ETIMEDOUT: Connection to Pterodactyl API timed out after creation');
    }

    return { externalId, identifier };
  }

  async lookupByCorrelationTag(tag: string): Promise<ObservedResource | null> {
    for (const s of this.servers.values()) {
      if (s.correlationTag === tag) {
        return s;
      }
    }
    return null;
  }

  async powerAction(externalId: string, action: 'START' | 'STOP' | 'RESTART' | 'KILL'): Promise<void> {
    const s = this.servers.get(externalId);
    if (!s) throw new Error(`Server ${externalId} not found on provider`);
    s.status = action === 'STOP' || action === 'KILL' ? 'STOPPED' : 'RUNNING';
  }

  async suspend(externalId: string): Promise<void> {
    const s = this.servers.get(externalId);
    if (!s) throw new Error(`Server ${externalId} not found on provider`);
    s.status = 'STOPPED';
  }

  async unsuspend(externalId: string): Promise<void> {
    const s = this.servers.get(externalId);
    if (!s) throw new Error(`Server ${externalId} not found on provider`);
    s.status = 'RUNNING';
  }

  async terminate(externalId: string): Promise<void> {
    if (!this.servers.has(externalId)) {
      throw new Error(`Server ${externalId} not found on provider`);
    }
    this.servers.delete(externalId);
  }

  getServerCount(): number {
    return this.servers.size;
  }
}
