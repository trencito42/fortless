export type FastDlEngine = 'goldsrc' | 'source' | 'cod';
export type FastDlCompressionMode = 'bz2' | 'raw' | 'both';

export interface FastDlProfile {
  slug: string;
  name: string;
  engine: FastDlEngine;
  eggNames: string[];
  gameDir: string;
  assetDirs: string[];
  extensions: string[];
  compression: FastDlCompressionMode;
  configFile: string;
  cvarTemplate: string;
  additionalCvars?: Record<string, string>;
  description?: string;
}

export interface FastDlManifestItem {
  id: string;
  serviceId: string;
  filePath: string;
  fileSize: number;
  compressedSize: number;
  fileHash: string;
  isCompressed: boolean;
  storageRelPath: string;
  status: 'SYNCED' | 'PENDING' | 'FAILED' | 'DELETED';
  lastError?: string | null;
  syncedAt: string;
}

export interface FastDlSyncJob {
  id: string;
  serviceId: string;
  accountId: string;
  triggerType: 'MANUAL' | 'SCHEDULED' | 'WEBHOOK' | 'FILE_EVENT' | 'RETRY';
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  totalFiles: number;
  processedFiles: number;
  syncedFiles: number;
  deletedFiles: number;
  failedFiles: number;
  totalBytes: number;
  currentFile?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FastDlConfigRecord {
  serviceId: string;
  enabled: boolean;
  autoSync: boolean;
  compressionMode: FastDlCompressionMode;
  quotaBytes: number;
  customPublicUrl: string | null;
  lastSyncAt: string | null;
  cvarConfiguredAt: string | null;
  cvarBackupPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FastDlGlobalSettings {
  id: string;
  publicDomain: string;
  storageBackend: 'local' | 's3' | 'custom_cdn';
  storagePath: string;
  defaultQuotaBytes: number;
  maxFileSizeBytes: number;
  autoSyncEnabled: boolean;
  updatedAt: string;
}

export interface FastDlStatusResponse {
  supported: boolean;
  reason?: string;
  profile?: FastDlProfile | null;
  config?: {
    enabled: boolean;
    autoSync: boolean;
    compressionMode: FastDlCompressionMode;
    quotaBytes: number;
    customPublicUrl?: string | null;
    lastSyncAt?: string | null;
    cvarConfiguredAt?: string | null;
    cvarBackupPath?: string | null;
  } | null;
  stats?: {
    totalFiles: number;
    totalOriginalBytes: number;
    totalStoredBytes: number;
    quotaBytes: number;
    percentUsed: number;
    cvarConfigured: boolean;
  };
  activeJob?: FastDlSyncJob | null;
  publicDownloadUrl?: string;
}
