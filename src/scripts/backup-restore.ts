import path from 'node:path';
import fs from 'node:fs';
import { createDatabaseBackup, verifyAndRestoreBackup } from '../modules/backup/backup.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'backup': {
      const encrypt = args.includes('--encrypt');
      const encryptionKey = encrypt
        ? process.env.FORTLESS_BACKUP_KEY || 'default-fortless-backup-secret-key-32b'
        : undefined;

      console.log(`Starting database backup (Encryption: ${encrypt ? 'AES-256-GCM' : 'Disabled'})...`);
      const meta = await createDatabaseBackup({
        encryptionKey,
      });

      console.log('✅ Backup created successfully:');
      console.log(`   Backup ID:   ${meta.backupId}`);
      console.log(`   File Path:   ${meta.backupFilePath}`);
      console.log(`   SHA-256:     ${meta.sha256}`);
      console.log(`   Size:        ${(meta.byteSize / 1024).toFixed(1)} KB`);
      console.log(`   Encrypted:   ${meta.isEncrypted ? 'YES' : 'NO'}`);
      console.log(`   Tables:      ${Object.keys(meta.tableCounts).length} tables backed up`);
      break;
    }

    case 'verify': {
      const backupPath = args[1];
      if (!backupPath) {
        console.error('Usage: tsx src/scripts/backup-restore.ts verify <path-to-backup.db>');
        process.exit(1);
      }

      const isEncrypted = backupPath.endsWith('.enc.db');
      const encryptionKey = isEncrypted
        ? process.env.FORTLESS_BACKUP_KEY || 'default-fortless-backup-secret-key-32b'
        : undefined;

      // Restore to a temporary isolated path to verify integrity
      const tempRestorePath = path.join(process.cwd(), 'data', 'temp_verify.db');

      try {
        console.log(`Verifying backup file: ${backupPath}...`);
        const report = await verifyAndRestoreBackup({
          backupFilePath: backupPath,
          targetDbPath: tempRestorePath,
          encryptionKey,
        });

        console.log('✅ Backup verification succeeded:');
        console.log(`   Integrity Check:       ${report.integrityCheck}`);
        console.log(`   Foreign Key Violations: ${report.foreignKeyViolations}`);
        console.log(`   Verified Tables:       ${Object.keys(report.tableCounts).length}`);
      } finally {
        if (fs.existsSync(tempRestorePath)) {
          fs.unlinkSync(tempRestorePath);
        }
      }
      break;
    }

    case 'restore': {
      const backupPath = args[1];
      const targetPath = args[2] || './data/fortless.db';

      if (!backupPath) {
        console.error('Usage: tsx src/scripts/backup-restore.ts restore <path-to-backup.db> [target-db-path]');
        process.exit(1);
      }

      const isEncrypted = backupPath.endsWith('.enc.db');
      const encryptionKey = isEncrypted
        ? process.env.FORTLESS_BACKUP_KEY || 'default-fortless-backup-secret-key-32b'
        : undefined;

      console.log(`Restoring backup: ${backupPath} -> ${targetPath}...`);
      const report = await verifyAndRestoreBackup({
        backupFilePath: backupPath,
        targetDbPath: targetPath,
        encryptionKey,
      });

      console.log('✅ Database restored successfully:');
      console.log(`   Target Path:           ${report.targetDbPath}`);
      console.log(`   Integrity Check:       ${report.integrityCheck}`);
      console.log(`   Foreign Key Violations: ${report.foreignKeyViolations}`);
      break;
    }

    default: {
      console.log('FORTLESS Database Backup & Disaster Recovery Utility');
      console.log('Commands:');
      console.log('  backup [--encrypt]                  Create a new database snapshot');
      console.log('  verify <path-to-backup.db>          Test backup integrity without altering production DB');
      console.log('  restore <path-to-backup.db> [target] Restore a backup to a specified target file');
      break;
    }
  }
}

main().catch((err) => {
  console.error('❌ Backup/Restore Error:', err.message);
  process.exit(1);
});
