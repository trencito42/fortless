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

export class ProviderError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class ProviderNetworkError extends ProviderError {
  constructor(message: string) {
    super(message, 'PROVIDER_NETWORK_TIMEOUT', 504);
    this.name = 'ProviderNetworkError';
  }
}

export class ProviderAuthenticationError extends ProviderError {
  constructor(message: string, statusCode = 401) {
    super(message, 'PROVIDER_AUTH_ERROR', statusCode);
    this.name = 'ProviderAuthenticationError';
  }
}

export class ProviderValidationError extends ProviderError {
  constructor(message: string) {
    super(message, 'PROVIDER_VALIDATION_ERROR', 422);
    this.name = 'ProviderValidationError';
  }
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
 * Real HTTP Provider Adapter for Pterodactyl 1.x panel.
 * Uses Pterodactyl Application API for server-to-server lifecycle orchestration
 * and Client API for scoped customer power actions.
 */
export class PterodactylHttpAdapter implements ProviderAdapter {
  readonly providerType = 'PTERODACTYL' as const;
  readonly version = '1.11.x';

  private readonly baseUrl: string;
  private readonly appApiKey: string;
  private readonly clientApiKey?: string;
  private readonly timeoutMs: number;

  constructor(options: {
    panelUrl: string;
    apiKey: string;
    clientApiKey?: string;
    timeoutMs?: number;
  }) {
    if (!options.panelUrl || !options.apiKey) {
      throw new ProviderAuthenticationError('Pterodactyl panel URL and API key are required.');
    }
    this.baseUrl = options.panelUrl.replace(/\/$/, '');
    this.appApiKey = options.apiKey;
    this.clientApiKey = options.clientApiKey;
    this.timeoutMs = options.timeoutMs || 10000;
  }

  private async request(
    endpoint: string,
    options: {
      method?: string;
      body?: unknown;
      useClientKey?: boolean;
    } = {}
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = options.method || 'GET';
    const key = options.useClientKey && this.clientApiKey ? this.clientApiKey : this.appApiKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Accept: 'Application/vnd.pterodactyl.v1+json',
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (response.status === 204) {
        return null;
      }

      if (response.status === 401 || response.status === 403) {
        throw new ProviderAuthenticationError(`Pterodactyl API rejected credentials (${response.status})`, response.status);
      }

      if (response.status === 422) {
        const errJson = await response.json().catch(() => ({}));
        const details = (errJson as { errors?: Array<{ detail: string }> }).errors?.map((e) => e.detail).join('; ') || 'Validation error';
        throw new ProviderValidationError(`Pterodactyl validation failed: ${details}`);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new ProviderError(`Pterodactyl API HTTP ${response.status}: ${text}`, `HTTP_${response.status}`, response.status);
      }

      return await response.json();
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        throw new ProviderNetworkError(`Pterodactyl API timed out after ${this.timeoutMs}ms on ${method} ${endpoint}`);
      }
      if (err instanceof ProviderError) {
        throw err;
      }
      throw new ProviderNetworkError(`Pterodactyl connection failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async lookupByCorrelationTag(tag: string): Promise<ObservedResource | null> {
    try {
      const res = await this.request(`/api/application/servers?filter[external_id]=${encodeURIComponent(tag)}`);
      const items = res?.data;
      if (!Array.isArray(items) || items.length === 0) {
        return null;
      }
      const attrs = items[0].attributes;
      return {
        externalId: String(attrs.id),
        identifier: attrs.identifier,
        name: attrs.name,
        status: attrs.suspended ? 'STOPPED' : attrs.status === 'installing' ? 'INSTALLING' : 'RUNNING',
        nodeId: String(attrs.node),
        limits: {
          memoryMb: attrs.limits?.memory || 0,
          cpuPct: attrs.limits?.cpu || 0,
          diskMb: attrs.limits?.disk || 0,
        },
      };
    } catch (err: unknown) {
      if (err instanceof ProviderError && err.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async provision(spec: ProvisioningSpec): Promise<{ externalId: string; identifier: string }> {
    // 1. Pre-flight check: Reconcile before creating
    const existing = await this.lookupByCorrelationTag(spec.correlationTag);
    if (existing) {
      return { externalId: existing.externalId, identifier: existing.identifier };
    }

    const payload = {
      name: spec.name,
      user: 1, // Default administrative/root tenant user on staging panel
      egg: spec.eggId || 1,
      docker_image: spec.dockerImage || 'ghcr.io/pterodactyl/yolks:java_17',
      startup: spec.startupCommand || 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar',
      environment: spec.environmentVariables || {},
      limits: {
        memory: spec.memoryMb,
        swap: 0,
        disk: spec.diskMb,
        io: 500,
        cpu: spec.cpuPct,
      },
      feature_limits: {
        databases: spec.databases || 1,
        backups: spec.backups || 2,
        allocations: 1,
      },
      external_id: spec.correlationTag,
      deploy: {
        locations: [],
        dedicated_ip: false,
        port_range: [],
      },
      start_on_completion: true,
    };

    try {
      const res = await this.request('/api/application/servers', {
        method: 'POST',
        body: payload,
      });

      const attrs = res?.attributes;
      if (!attrs || !attrs.id || !attrs.identifier) {
        throw new ProviderError('Malformed server creation response from Pterodactyl', 'MALFORMED_RESPONSE');
      }

      return { externalId: String(attrs.id), identifier: attrs.identifier };
    } catch (err: unknown) {
      // 2. Unknown outcome rule: on network timeout or 5xx, query by correlation tag before failing
      if (err instanceof ProviderNetworkError || (err instanceof ProviderError && (err.statusCode ?? 0) >= 500)) {
        const recovered = await this.lookupByCorrelationTag(spec.correlationTag).catch(() => null);
        if (recovered) {
          return { externalId: recovered.externalId, identifier: recovered.identifier };
        }
      }
      throw err;
    }
  }

  async powerAction(externalId: string, action: 'START' | 'STOP' | 'RESTART' | 'KILL'): Promise<void> {
    const signal = action.toLowerCase();
    // Power actions can be executed via Application API or Client API
    // Using application server lookup to get identifier if needed
    try {
      await this.request(`/api/client/servers/${externalId}/power`, {
        method: 'POST',
        body: { signal },
        useClientKey: true,
      });
    } catch (err: unknown) {
      // If client key is not configured, fall back to Application API or error
      if (err instanceof ProviderAuthenticationError && !this.clientApiKey) {
        throw new ProviderError('Client API access not configured for power actions', 'CLIENT_API_REQUIRED');
      }
      throw err;
    }
  }

  async suspend(externalId: string): Promise<void> {
    await this.request(`/api/application/servers/${externalId}/suspend`, { method: 'POST' });
  }

  async unsuspend(externalId: string): Promise<void> {
    await this.request(`/api/application/servers/${externalId}/unsuspend`, { method: 'POST' });
  }

  async terminate(externalId: string): Promise<void> {
    await this.request(`/api/application/servers/${externalId}`, { method: 'DELETE' });
  }
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
