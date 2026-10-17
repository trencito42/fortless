import { config } from './config/index.js';
import { getDatabase } from './database/index.js';
import { SCHEMA_SQL } from './database/schema.js';
import { runMigrations } from './database/migrations.js';
import { seedInitialCatalog } from './modules/catalog/catalog.js';
import { buildServer } from './server.js';

async function bootstrap() {
  console.log('⚡ Initializing FORTLESS Platform Core...');

  // 1. Initialize SQLite Database & Schema
  const db = getDatabase();
  db.exec(SCHEMA_SQL);
  const applied = runMigrations(db);
  console.log(`📦 Database initialized & WAL mode active at: ${config.DATABASE_PATH} (${applied} migration(s) applied)`);

  // 2. Seed initial catalog if empty
  seedInitialCatalog(db);
  console.log('🌱 Initial catalog & regions checked.');

  // 3. Build HTTP Server
  const server = buildServer();

  // 4. Start HTTP Server on port 3021
  try {
    const address = await server.listen({
      port: config.PORT,
      host: config.HOST,
    });
    console.log(`🚀 FORTLESS API listening at: ${address} (Bound to port ${config.PORT})`);
  } catch (err) {
    console.error('Failed to bind server:', err);
    process.exit(1);
  }

  // 5. Start Background Outbox Worker Loop
  console.log('⏸ Provisioning worker disabled: no sandbox-verified provider adapter is configured.');
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
