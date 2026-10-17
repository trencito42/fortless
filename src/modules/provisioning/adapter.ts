import { validateSafeOutboundUrl } from '../../utils/ssrf.js';

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

/**
 * Real HTTP Provider Adapter for cPanel / WHM 11.x+ API.
 * Uses WHM JSON API v1 for shared hosting account creation, package assignment,
 * suspension, unsuspension, and termination with strict anti-SSRF protection.
 */
export class CpanelHttpAdapter implements ProviderAdapter {
  readonly providerType = 'CPANEL' as const;
  readonly version = 'WHM-JSON-API-v1';

  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly username: string;
  private readonly timeoutMs: number;

  constructor(options: {
    whmUrl: string;
    apiToken: string;
    username?: string;
    timeoutMs?: number;
  }) {
    if (!options.whmUrl || !options.apiToken) {
      throw new ProviderAuthenticationError('WHM URL and API token are required for cPanel provider.');
    }
    this.baseUrl = options.whmUrl.replace(/\/$/, '');
    this.apiToken = options.apiToken;
    this.username = options.username || 'root';
    this.timeoutMs = options.timeoutMs || 10000;
  }

  private async request(endpoint: string, params: Record<string, string>): Promise<any> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set('api.version', '1');
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    // SSRF validation
    await validateSafeOutboundUrl(url.toString());

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `whm ${this.username}:${this.apiToken}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new ProviderAuthenticationError(`WHM authorization failed (${res.status}).`, res.status);
        }
        throw new ProviderError(`WHM request failed with status ${res.status}`, 'WHM_HTTP_ERROR', res.status);
      }

      const json = await res.json() as any;
      if (json.metadata && json.metadata.result === 0) {
        throw new ProviderError(json.metadata.reason || 'WHM operation rejected', 'WHM_API_ERROR');
      }
      return json;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new ProviderNetworkError('Connection to WHM timed out.');
      }
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(err.message || 'WHM request failed', 'WHM_REQUEST_FAILED');
    } finally {
      clearTimeout(timeout);
    }
  }

  async provision(spec: ProvisioningSpec): Promise<{ externalId: string; identifier: string }> {
    const existing = await this.lookupByCorrelationTag(spec.correlationTag);
    if (existing) {
      return { externalId: existing.externalId, identifier: existing.identifier };
    }

    const cpUsername = spec.correlationTag.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase() || 'cp' + spec.serviceId.slice(-8);
    const domain = spec.environmentVariables?.DOMAIN || `${cpUsername}.fortless.cloud`;
    const plan = spec.environmentVariables?.PLAN || 'standard';

    try {
      await this.request('/json-api/createacct', {
        username: cpUsername,
        domain,
        plan,
        customfield: spec.correlationTag,
      });

      return { externalId: cpUsername, identifier: cpUsername };
    } catch (err: unknown) {
      if (err instanceof ProviderNetworkError || (err instanceof ProviderError && (err.statusCode ?? 0) >= 500)) {
        const recovered = await this.lookupByCorrelationTag(spec.correlationTag).catch(() => null);
        if (recovered) {
          return { externalId: recovered.externalId, identifier: recovered.identifier };
        }
      }
      throw err;
    }
  }

  async lookupByCorrelationTag(tag: string): Promise<ObservedResource | null> {
    try {
      const res = await this.request('/json-api/listaccts', {
        search: tag,
        searchtype: 'user',
      });
      const accts = res?.data?.acct;
      if (Array.isArray(accts) && accts.length > 0) {
        const a = accts[0];
        return {
          externalId: a.user,
          identifier: a.user,
          name: a.domain || a.user,
          status: a.suspended === 1 ? 'STOPPED' : 'RUNNING',
          nodeId: 'cpanel_node_01',
          limits: {
            memoryMb: 1024,
            cpuPct: 100,
            diskMb: 10240,
          },
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async powerAction(_externalId: string, _action: 'START' | 'STOP' | 'RESTART' | 'KILL'): Promise<void> {
    throw new ProviderError('Direct power actions are unsupported on shared cPanel hosting.', 'UNSUPPORTED_OPERATION');
  }

  async suspend(externalId: string): Promise<void> {
    await this.request('/json-api/suspendacct', {
      user: externalId,
      reason: 'Billing suspension via Fortless',
    });
  }

  async unsuspend(externalId: string): Promise<void> {
    await this.request('/json-api/unsuspendacct', {
      user: externalId,
    });
  }

  async terminate(externalId: string): Promise<void> {
    await this.request('/json-api/removeacct', {
      user: externalId,
    });
  }
}

/**
 * Deterministic in-memory Mock cPanel / WHM Adapter for automated testing.
 */
export class MockCpanelAdapter implements ProviderAdapter {
  readonly providerType = 'CPANEL' as const;
  readonly version = 'MOCK-1.0';

  private accounts = new Map<string, {
    username: string;
    domain: string;
    status: 'RUNNING' | 'STOPPED';
    correlationTag: string;
    suspended: boolean;
  }>();

  public simulateTimeoutOnNextProvision = false;

  async provision(spec: ProvisioningSpec): Promise<{ externalId: string; identifier: string }> {
    const existing = await this.lookupByCorrelationTag(spec.correlationTag);
    if (existing) {
      return { externalId: existing.externalId, identifier: existing.identifier };
    }

    const username = spec.correlationTag.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase() || 'cp' + spec.serviceId.slice(-8);
    const domain = spec.environmentVariables?.DOMAIN || `${username}.fortless.cloud`;

    this.accounts.set(username, {
      username,
      domain,
      status: 'RUNNING',
      correlationTag: spec.correlationTag,
      suspended: false,
    });

    if (this.simulateTimeoutOnNextProvision) {
      this.simulateTimeoutOnNextProvision = false;
      throw new ProviderNetworkError('ETIMEDOUT: Connection to WHM timed out after creation');
    }

    return { externalId: username, identifier: username };
  }

  async lookupByCorrelationTag(tag: string): Promise<ObservedResource | null> {
    for (const a of this.accounts.values()) {
      if (a.correlationTag === tag || a.username === tag) {
        return {
          externalId: a.username,
          identifier: a.username,
          name: a.domain,
          status: a.status,
          nodeId: 'cpanel_mock_node',
          limits: { memoryMb: 1024, cpuPct: 100, diskMb: 10240 },
        };
      }
    }
    return null;
  }

  async powerAction(_externalId: string, _action: 'START' | 'STOP' | 'RESTART' | 'KILL'): Promise<void> {
    throw new ProviderError('Direct power actions are unsupported on shared cPanel hosting.', 'UNSUPPORTED_OPERATION');
  }

  async suspend(externalId: string): Promise<void> {
    const a = this.accounts.get(externalId);
    if (!a) throw new Error(`cPanel account ${externalId} not found`);
    a.status = 'STOPPED';
    a.suspended = true;
  }

  async unsuspend(externalId: string): Promise<void> {
    const a = this.accounts.get(externalId);
    if (!a) throw new Error(`cPanel account ${externalId} not found`);
    a.status = 'RUNNING';
    a.suspended = false;
  }

  async terminate(externalId: string): Promise<void> {
    if (!this.accounts.has(externalId)) throw new Error(`cPanel account ${externalId} not found`);
    this.accounts.delete(externalId);
  }

  getAccountCount(): number {
    return this.accounts.size;
  }
}

export interface ProxmoxAdapterOptions {
  pveUrl: string;
  apiTokenId: string;
  apiTokenSecret: string;
  nodeName?: string;
  templateVmid?: number;
  storage?: string;
  bridge?: string;
  timeoutMs?: number;
}

/**
 * Production Proxmox VE 8.x / KVM Cloud VPS Adapter.
 * Dispatches authenticated REST requests to Proxmox API with SSRF protection.
 */
export class ProxmoxHttpAdapter implements ProviderAdapter {
  readonly providerType = 'VPS' as const;
  readonly version = 'PVE-8.x';

  private baseUrl: string;
  private apiTokenId: string;
  private apiTokenSecret: string;
  private nodeName: string;
  private templateVmid: number;
  private storage: string;
  private bridge: string;
  private timeoutMs: number;

  constructor(options: ProxmoxAdapterOptions) {
    if (!options.pveUrl || !options.apiTokenId || !options.apiTokenSecret) {
      throw new ProviderAuthenticationError('Proxmox cluster URL, API token ID, and secret are required.');
    }
    this.baseUrl = options.pveUrl.replace(/\/$/, '');
    this.apiTokenId = options.apiTokenId;
    this.apiTokenSecret = options.apiTokenSecret;
    this.nodeName = options.nodeName || 'pve-node-01';
    this.templateVmid = options.templateVmid || 9000;
    this.storage = options.storage || 'local-zfs';
    this.bridge = options.bridge || 'vmbr0';
    this.timeoutMs = options.timeoutMs || 15000;
  }

  private async request(method: string, endpoint: string, body?: Record<string, any>): Promise<any> {
    const url = `${this.baseUrl}/api2/json${endpoint}`;
    await validateSafeOutboundUrl(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Authorization': `PVEAPIToken=${this.apiTokenId}=${this.apiTokenSecret}`,
        'Accept': 'application/json',
      };
      let requestBody: string | undefined;
      if (body) {
        headers['Content-Type'] = 'application/json';
        requestBody = JSON.stringify(body);
      }

      const res = await fetch(url, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new ProviderAuthenticationError(`Proxmox authorization failed (${res.status}).`, res.status);
        }
        throw new ProviderError(`Proxmox API request failed with status ${res.status}`, 'PROXMOX_HTTP_ERROR', res.status);
      }

      const json = (await res.json()) as any;
      return json.data;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new ProviderNetworkError('Connection to Proxmox VE cluster timed out.');
      }
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(err.message || 'Proxmox request failed', 'PROXMOX_REQUEST_FAILED');
    } finally {
      clearTimeout(timeout);
    }
  }

  async provision(spec: ProvisioningSpec): Promise<{ externalId: string; identifier: string }> {
    const existing = await this.lookupByCorrelationTag(spec.correlationTag);
    if (existing) {
      return { externalId: existing.externalId, identifier: existing.identifier };
    }

    try {
      const vmidData = await this.request('GET', '/cluster/nextid');
      const newVmid = String(vmidData);

      // Clone from template VM with cloud-init
      await this.request('POST', `/nodes/${this.nodeName}/qemu/${this.templateVmid}/clone`, {
        newid: parseInt(newVmid, 10),
        name: spec.name.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 32).toLowerCase() || `vps-${newVmid}`,
        description: `fortless_tag:${spec.correlationTag};service:${spec.serviceId}`,
        full: 1,
        storage: this.storage,
      });

      // Configure vCPU, RAM, and Cloud-Init
      const cores = Math.max(1, Math.round(spec.cpuPct / 100));
      await this.request('POST', `/nodes/${this.nodeName}/qemu/${newVmid}/config`, {
        cores,
        memory: spec.memoryMb,
        net0: `virtio,bridge=${this.bridge}`,
        ciuser: 'debian',
        cipassword: spec.environmentVariables?.ROOT_PASSWORD || undefined,
        sshkeys: spec.environmentVariables?.SSH_KEY ? encodeURIComponent(spec.environmentVariables.SSH_KEY) : undefined,
      });

      // Start VM
      await this.request('POST', `/nodes/${this.nodeName}/qemu/${newVmid}/status/start`);

      return { externalId: newVmid, identifier: newVmid };
    } catch (err: any) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(err.message || 'Proxmox VM provisioning failed', 'PROXMOX_PROVISION_FAILED');
    }
  }

  async lookupByCorrelationTag(tag: string): Promise<ObservedResource | null> {
    try {
      const vms = (await this.request('GET', `/nodes/${this.nodeName}/qemu`)) as any[];
      if (!Array.isArray(vms)) return null;

      for (const vm of vms) {
        const vmid = String(vm.vmid);
        try {
          const config = await this.request('GET', `/nodes/${this.nodeName}/qemu/${vmid}/config`);
          const desc = config?.description || '';
          if (desc.includes(`fortless_tag:${tag}`) || desc.includes(tag)) {
            return {
              externalId: vmid,
              identifier: vmid,
              name: vm.name || `vps-${vmid}`,
              status: vm.status === 'running' ? 'RUNNING' : 'STOPPED',
              nodeId: this.nodeName,
              limits: {
                memoryMb: Math.round((vm.maxmem || 0) / (1024 * 1024)),
                cpuPct: (vm.cpus || 1) * 100,
                diskMb: Math.round((vm.maxdisk || 0) / (1024 * 1024)),
              },
            };
          }
        } catch {
          // Continue scanning
        }
      }
      return null;
    } catch (err: any) {
      if (err instanceof ProviderError) throw err;
      return null;
    }
  }

  async lookupByExternalId(externalId: string): Promise<ObservedResource | null> {
    try {
      const vm = await this.request('GET', `/nodes/${this.nodeName}/qemu/${externalId}/status/current`);
      if (!vm) return null;
      return {
        externalId,
        identifier: externalId,
        name: vm.name || `vps-${externalId}`,
        status: vm.status === 'running' ? 'RUNNING' : 'STOPPED',
        nodeId: this.nodeName,
        limits: {
          memoryMb: Math.round((vm.maxmem || 0) / (1024 * 1024)),
          cpuPct: (vm.cpus || 1) * 100,
          diskMb: Math.round((vm.maxdisk || 0) / (1024 * 1024)),
        },
      };
    } catch {
      return null;
    }
  }

  async powerAction(externalId: string, action: 'START' | 'STOP' | 'RESTART' | 'KILL'): Promise<void> {
    const actionMap: Record<string, string> = {
      START: 'start',
      STOP: 'shutdown',
      RESTART: 'reboot',
      KILL: 'stop',
    };
    const pveAction = actionMap[action] || 'start';
    await this.request('POST', `/nodes/${this.nodeName}/qemu/${externalId}/status/${pveAction}`);
  }

  async createVncTicket(externalId: string): Promise<{ ticket: string; port: number }> {
    const data = await this.request('POST', `/nodes/${this.nodeName}/qemu/${externalId}/vncproxy`, { websocket: 1 });
    return {
      ticket: data.ticket,
      port: data.port,
    };
  }

  async suspend(externalId: string): Promise<void> {
    await this.request('POST', `/nodes/${this.nodeName}/qemu/${externalId}/status/suspend`);
  }

  async unsuspend(externalId: string): Promise<void> {
    await this.request('POST', `/nodes/${this.nodeName}/qemu/${externalId}/status/resume`);
  }

  async terminate(externalId: string): Promise<void> {
    try {
      await this.request('POST', `/nodes/${this.nodeName}/qemu/${externalId}/status/stop`);
    } catch {
      // Ignore if already stopped
    }
    await this.request('DELETE', `/nodes/${this.nodeName}/qemu/${externalId}`, { purge: 1 });
  }
}

/**
 * Deterministic in-memory Mock Proxmox / KVM Adapter for automated testing.
 */
export class MockProxmoxAdapter implements ProviderAdapter {
  readonly providerType = 'VPS' as const;
  readonly version = 'MOCK-PVE-8.0';

  private vms = new Map<
    string,
    {
      vmid: string;
      name: string;
      status: 'RUNNING' | 'STOPPED' | 'PAUSED';
      cores: number;
      memoryMb: number;
      diskMb: number;
      ipAddress: string;
      correlationTag: string;
      suspended: boolean;
    }
  >();

  private nextVmid = 100;
  public simulateTimeoutOnNextProvision = false;

  async provision(spec: ProvisioningSpec): Promise<{ externalId: string; identifier: string }> {
    const existing = await this.lookupByCorrelationTag(spec.correlationTag);
    if (existing) {
      return { externalId: existing.externalId, identifier: existing.identifier };
    }

    const vmid = String(this.nextVmid++);
    const cores = Math.max(1, Math.round(spec.cpuPct / 100));

    this.vms.set(vmid, {
      vmid,
      name: spec.name,
      status: 'RUNNING',
      cores,
      memoryMb: spec.memoryMb,
      diskMb: spec.diskMb,
      ipAddress: `198.51.100.${vmid}`,
      correlationTag: spec.correlationTag,
      suspended: false,
    });

    if (this.simulateTimeoutOnNextProvision) {
      this.simulateTimeoutOnNextProvision = false;
      throw new ProviderNetworkError('ETIMEDOUT: Connection to Proxmox VE timed out after VM clone');
    }

    return { externalId: vmid, identifier: vmid };
  }

  async lookupByCorrelationTag(tag: string): Promise<ObservedResource | null> {
    for (const vm of this.vms.values()) {
      if (vm.correlationTag === tag || vm.vmid === tag) {
        return {
          externalId: vm.vmid,
          identifier: vm.vmid,
          name: vm.name,
          status: vm.status === 'RUNNING' ? 'RUNNING' : 'STOPPED',
          nodeId: 'pve_mock_node_01',
          limits: { memoryMb: vm.memoryMb, cpuPct: vm.cores * 100, diskMb: vm.diskMb },
        };
      }
    }
    return null;
  }

  async lookupByExternalId(externalId: string): Promise<ObservedResource | null> {
    const vm = this.vms.get(externalId);
    if (!vm) return null;
    return {
      externalId: vm.vmid,
      identifier: vm.vmid,
      name: vm.name,
      status: vm.status === 'RUNNING' ? 'RUNNING' : 'STOPPED',
      nodeId: 'pve_mock_node_01',
      limits: { memoryMb: vm.memoryMb, cpuPct: vm.cores * 100, diskMb: vm.diskMb },
    };
  }

  async powerAction(externalId: string, action: 'START' | 'STOP' | 'RESTART' | 'KILL'): Promise<void> {
    const vm = this.vms.get(externalId);
    if (!vm) throw new Error(`VM ${externalId} not found`);

    if (action === 'START') {
      vm.status = 'RUNNING';
    } else if (action === 'STOP' || action === 'KILL') {
      vm.status = 'STOPPED';
    } else if (action === 'RESTART') {
      vm.status = 'RUNNING';
    }
  }

  async createVncTicket(externalId: string): Promise<{ ticket: string; port: number }> {
    const vm = this.vms.get(externalId);
    if (!vm) throw new Error(`VM ${externalId} not found`);
    return {
      ticket: `PVEVNC:test_ticket_token_${vm.vmid}`,
      port: 5900 + parseInt(vm.vmid, 10),
    };
  }

  async suspend(externalId: string): Promise<void> {
    const vm = this.vms.get(externalId);
    if (!vm) throw new Error(`VM ${externalId} not found`);
    vm.status = 'PAUSED';
    vm.suspended = true;
  }

  async unsuspend(externalId: string): Promise<void> {
    const vm = this.vms.get(externalId);
    if (!vm) throw new Error(`VM ${externalId} not found`);
    vm.status = 'RUNNING';
    vm.suspended = false;
  }

  async terminate(externalId: string): Promise<void> {
    if (!this.vms.has(externalId)) throw new Error(`VM ${externalId} not found`);
    this.vms.delete(externalId);
  }

  getVmCount(): number {
    return this.vms.size;
  }
}

