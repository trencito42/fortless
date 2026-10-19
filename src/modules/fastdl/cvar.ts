import type Database from 'better-sqlite3';
import type { FastDlProfile } from './types.js';

export interface CvarConfigResult {
  success: boolean;
  backupPath: string | null;
  downloadUrl: string;
  appliedLines: string[];
}

export function formatCvars(profile: FastDlProfile, downloadUrl: string): string[] {
  // Ensure download URL ends with trailing slash as required by GoldSrc/Source engines
  const normalizedUrl = downloadUrl.endsWith('/') ? downloadUrl : `${downloadUrl}/`;
  const mainLine = profile.cvarTemplate.replace('{downloadUrl}', normalizedUrl);
  const lines = [mainLine];

  if (profile.additionalCvars) {
    for (const [k, v] of Object.entries(profile.additionalCvars)) {
      lines.push(`${k} ${v}`);
    }
  }

  return lines;
}

export function isCvarConfigured(content: string, profile: FastDlProfile, downloadUrl: string): boolean {
  if (!content) return false;
  const normalizedUrl = downloadUrl.endsWith('/') ? downloadUrl : `${downloadUrl}/`;

  if (profile.engine === 'cod') {
    return content.includes('sv_wwwBaseURL') && content.includes(normalizedUrl);
  }

  return content.includes('sv_downloadurl') && content.includes(normalizedUrl);
}

export function updateServerCfgContent(
  originalContent: string,
  profile: FastDlProfile,
  downloadUrl: string
): { updatedContent: string; appliedLines: string[] } {
  const normalizedUrl = downloadUrl.endsWith('/') ? downloadUrl : `${downloadUrl}/`;
  const appliedLines = formatCvars(profile, normalizedUrl);
  const lines = originalContent.split(/\r?\n/);

  const keyToMatch = profile.engine === 'cod' ? 'sv_wwwBaseURL' : 'sv_downloadurl';
  let replaced = false;

  const newLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(keyToMatch) || trimmed.startsWith(`set ${keyToMatch}`) || trimmed.startsWith(`seta ${keyToMatch}`)) {
      newLines.push(appliedLines[0]!);
      replaced = true;
    } else {
      newLines.push(line);
    }
  }

  if (!replaced) {
    if (newLines.length > 0 && newLines[newLines.length - 1]!.trim() !== '') {
      newLines.push('');
    }
    newLines.push('// --- Fortless Auto FastDL Configuration ---');
    for (const al of appliedLines) {
      newLines.push(al);
    }
    newLines.push('// ------------------------------------------');
  }

  return {
    updatedContent: newLines.join('\n'),
    appliedLines,
  };
}

export function recordCvarConfiguration(
  db: Database.Database,
  serviceId: string,
  backupPath: string | null
): void {
  db.prepare(`
    INSERT INTO fastdl_configs (
      service_id, enabled, auto_sync, compression_mode, quota_bytes,
      cvar_configured_at, cvar_backup_path, updated_at
    ) VALUES (?, 1, 1, 'bz2', 5368709120, datetime('now', 'utc'), ?, datetime('now', 'utc'))
    ON CONFLICT(service_id) DO UPDATE SET
      cvar_configured_at = datetime('now', 'utc'),
      cvar_backup_path = excluded.cvar_backup_path,
      updated_at = datetime('now', 'utc')
  `).run(serviceId, backupPath);
}
