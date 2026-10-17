import { getDatabase } from '../database/index.js';
import { runMigrations } from '../database/migrations.js';
import { SCHEMA_SQL } from '../database/schema.js';
import { config } from '../config/index.js';

function main() {
  console.log('🔄 Running standalone database migrations...');
  console.log(`📦 Target Database: ${config.DATABASE_PATH}`);
  const db = getDatabase();
  db.exec(SCHEMA_SQL);
  const applied = runMigrations(db);
  console.log(`✅ Applied ${applied} migration(s) successfully.`);
}

main();
