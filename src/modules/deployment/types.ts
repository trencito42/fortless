export type WorkloadCategory = 'game-servers' | 'discord-bots' | 'apps' | 'databases';

export interface SoftwareOption {
  id: string;
  name: string;
  description: string;
  recommended?: boolean;
  versions: string[];
  defaultVersion: string;
  defaultImage?: string;
  eggNamePattern: string;
  ecosystem: 'bukkit_spigot' | 'fabric' | 'forge' | 'vanilla' | 'bedrock' | 'goldsrc' | 'source' | 'node' | 'python' | 'database';
}

export interface PresetOption {
  id: string;
  name: string;
  description: string;
  softwareCompatibility: string[];
  requiredDependencies: string[];
  recommendedAddons: string[];
  isDefault?: boolean;
}

export interface AddonOption {
  id: string;
  name: string;
  description: string;
  kind: 'plugin' | 'mod' | 'extension' | 'dependency' | 'package';
  compatibleSoftware: string[];
  incompatibleSoftware?: string[];
  requiredDependencies: string[];
  downloadUrl?: string;
  defaultSelected?: boolean;
}

export interface ConfigFieldDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'secret';
  options?: Array<{ value: string; label: string }>;
  default?: string | number | boolean;
  description?: string;
  required?: boolean;
}

export interface WorkloadDefinition {
  id: string;
  category: WorkloadCategory;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  supported: boolean;
  unsupportedReason?: string;
  defaultSetupMode: 'QUICK' | 'CUSTOM';
  softwareOptions: SoftwareOption[];
  presets: PresetOption[];
  addonOptions: AddonOption[];
  configurationFields?: ConfigFieldDef[];
  minMemoryMb?: number;
  minDiskMb?: number;
}

export interface DeploymentSpecification {
  workloadId: string;
  setupMode: 'QUICK' | 'CUSTOM';
  softwareId: string;
  softwareVersion: string;
  presetId?: string;
  selectedAddons: string[];
  environmentVariables: Record<string, string>;
  serverProperties?: Record<string, string>;
  gitSource?: {
    repoUrl: string;
    branch?: string;
    buildCommand?: string;
    startCommand?: string;
  };
  botConfig?: {
    tokenSecret?: string;
    runtimeVersion?: string;
    packageManager?: string;
    entrypoint?: string;
    deploymentPath?: 'blank' | 'github' | 'zip' | 'starter';
    starterId?: string;
  };
  appConfig?: {
    runtimeVersion?: string;
    port?: number;
    buildCommand?: string;
    startCommand?: string;
    deploymentPath?: 'blank' | 'github' | 'zip' | 'starter';
    starterId?: string;
  };
  cs16Config?: {
    environment: 'rehlds' | 'hlds';
    maxPlayers: number;
    startingMap: string;
    gameMode: string;
  };
  eulaAccepted?: boolean;
  serverName: string;
  planVersionId: string;
  regionId: string;
}

export interface DeploymentTaskRecord {
  id: string;
  serviceId: string;
  taskName: string;
  taskType: 'EGG_RESOLVE' | 'PROVISION_CONTAINER' | 'APPLY_CONFIG' | 'INSTALL_ADDON' | 'INITIALIZE_CODE';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  errorMessage: string | null;
  details: Record<string, unknown>;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface DeploymentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  spec: DeploymentSpecification;
  resolvedEggPattern?: string;
  minMemoryMb?: number;
}
