import { isPrivateOrReservedIp } from '../../utils/ssrf.js';
import { getWorkloadDefinition } from './registry.js';
import type { DeploymentSpecification, DeploymentValidationResult } from './types.js';

export class DeploymentValidationError extends Error {
  constructor(public readonly errors: string[], public readonly code = 'INVALID_DEPLOYMENT_SPEC') {
    super(errors.join('; '));
    this.name = 'DeploymentValidationError';
  }
}

export function validateDeploymentSpec(spec: unknown): DeploymentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!spec || typeof spec !== 'object') {
    throw new DeploymentValidationError(['Deployment specification must be a non-empty object.']);
  }

  const s = spec as Partial<DeploymentSpecification>;

  // 1. Server Label
  const serverName = typeof s.serverName === 'string' ? s.serverName.trim() : '';
  if (serverName.length < 3 || serverName.length > 64) {
    errors.push('Server name must be between 3 and 64 characters.');
  }

  // 2. Workload
  if (!s.workloadId) {
    errors.push('A valid workload must be selected.');
    throw new DeploymentValidationError(errors);
  }

  const workload = getWorkloadDefinition(s.workloadId);
  if (!workload) {
    errors.push(`Workload "${s.workloadId}" is not recognized.`);
    throw new DeploymentValidationError(errors);
  }

  if (!workload.supported) {
    errors.push(workload.unsupportedReason || `Workload "${workload.name}" is currently unsupported.`);
    throw new DeploymentValidationError(errors);
  }

  // 3. Setup Mode
  const setupMode = s.setupMode === 'CUSTOM' ? 'CUSTOM' : 'QUICK';

  // 4. Software & Version
  if (!s.softwareId) {
    errors.push(`A software distribution must be selected for ${workload.name}.`);
  }

  const software = workload.softwareOptions.find((sw) => sw.id === s.softwareId);
  if (!software) {
    errors.push(`Software "${s.softwareId}" is not valid for ${workload.name}.`);
  }

  let softwareVersion = typeof s.softwareVersion === 'string' ? s.softwareVersion.trim() : '';
  if (software) {
    if (!softwareVersion) {
      softwareVersion = software.defaultVersion;
    } else if (!software.versions.includes(softwareVersion)) {
      errors.push(`Version "${softwareVersion}" is not compatible with ${software.name}. Supported versions: ${software.versions.join(', ')}.`);
    }
  }

  // 5. Presets & Addons
  const selectedAddons = Array.isArray(s.selectedAddons) ? s.selectedAddons.map(String) : [];

  if (setupMode === 'QUICK') {
    // In Quick Setup, strictly no optional packages or addons may be installed
    if (selectedAddons.length > 0) {
      warnings.push('Quick Setup installs a clean instance without optional addons. Selected addons were cleared.');
      selectedAddons.length = 0;
    }
  } else {
    // Custom Setup: Validate addons against software compatibility & dependencies
    for (const addonId of selectedAddons) {
      const addonDef = workload.addonOptions.find((a) => a.id === addonId);
      if (!addonDef) {
        errors.push(`Unrecognized addon "${addonId}" for ${workload.name}.`);
        continue;
      }

      if (software && !addonDef.compatibleSoftware.includes(software.id)) {
        errors.push(`Addon "${addonDef.name}" is not compatible with ${software.name}.`);
      }

      if (software && addonDef.incompatibleSoftware?.includes(software.id)) {
        errors.push(`Addon "${addonDef.name}" cannot be installed on ${software.name}.`);
      }

      // Verify required dependencies
      for (const reqDep of addonDef.requiredDependencies) {
        if (!selectedAddons.includes(reqDep)) {
          const reqDef = workload.addonOptions.find((a) => a.id === reqDep);
          errors.push(`Addon "${addonDef.name}" requires "${reqDef?.name || reqDep}" to be selected.`);
        }
      }
    }
  }

  // 6. Workload-Specific Rules
  // A. Minecraft
  if (workload.id === 'minecraft') {
    if (s.eulaAccepted !== true && setupMode === 'CUSTOM') {
      errors.push('You must accept the Mojang Minecraft EULA to deploy a Minecraft server.');
    }

    // Never mix Bukkit/Spigot plugins with Forge/Fabric pure mod loaders
    if (software?.ecosystem === 'fabric' || software?.ecosystem === 'forge') {
      const pluginOnly = ['essentialsx', 'vault', 'viaversion'];
      for (const p of pluginOnly) {
        if (selectedAddons.includes(p)) {
          errors.push(`Spigot plugin "${p}" cannot be installed on ${software.name} mod loader.`);
        }
      }
    }
  }

  // B. Counter-Strike 1.6
  if (workload.id === 'cs16') {
    const cs16 = s.cs16Config || {
      environment: 'rehlds',
      maxPlayers: 24,
      startingMap: 'de_dust2',
      gameMode: 'classic',
    };

    if (!['16', '24', '32', 16, 24, 32].includes(cs16.maxPlayers)) {
      errors.push('CS 1.6 player slots must be 16, 24, or 32.');
    }

    // Preset dependencies
    if (s.presetId && s.presetId !== 'classic') {
      const presetDef = workload.presets.find((p) => p.id === s.presetId);
      if (presetDef) {
        for (const req of presetDef.requiredDependencies) {
          if (!selectedAddons.includes(req)) {
            errors.push(`Game mode "${presetDef.name}" requires addon "${req}" to be enabled.`);
          }
        }
      }
    }
  }

  // C. Discord Bot
  if (workload.id === 'discord-bot') {
    const bot = s.botConfig;
    if (bot?.deploymentPath === 'github' && s.gitSource?.repoUrl) {
      validateGitUrl(s.gitSource.repoUrl, errors);
    }
  }

  // D. General Applications
  if (workload.id === 'nodejs-app') {
    if (s.gitSource?.repoUrl) {
      validateGitUrl(s.gitSource.repoUrl, errors);
    }
    if (s.appConfig?.port !== undefined) {
      const port = Number(s.appConfig.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        errors.push('Application port must be between 1 and 65535.');
      }
    }
  }

  if (errors.length > 0) {
    throw new DeploymentValidationError(errors);
  }

  const validatedSpec: DeploymentSpecification = {
    workloadId: workload.id,
    setupMode,
    softwareId: software?.id || s.softwareId || '',
    softwareVersion,
    presetId: s.presetId || workload.presets[0]?.id,
    selectedAddons,
    environmentVariables: s.environmentVariables || {},
    serverProperties: s.serverProperties,
    gitSource: s.gitSource,
    botConfig: s.botConfig,
    appConfig: s.appConfig,
    cs16Config: s.cs16Config,
    eulaAccepted: s.eulaAccepted ?? (setupMode === 'QUICK'),
    serverName,
    planVersionId: s.planVersionId || '',
    regionId: s.regionId || 'reg_fra_1',
  };

  return {
    valid: true,
    errors: [],
    warnings,
    spec: validatedSpec,
    resolvedEggPattern: software?.eggNamePattern,
    minMemoryMb: workload.minMemoryMb,
  };
}

function validateGitUrl(url: string, errors: string[]): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      errors.push('Only HTTP and HTTPS repository URLs are supported.');
      return;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '127.0.0.1' ||
      host === '169.254.169.254' ||
      isPrivateOrReservedIp(host)
    ) {
      errors.push('Private, loopback, or cloud-metadata repository URLs are strictly forbidden.');
    }
  } catch {
    errors.push('Repository URL must be a valid, well-formed URL.');
  }
}
