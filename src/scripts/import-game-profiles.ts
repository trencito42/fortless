/** Imports or updates game profiles from data/game-profiles/*.json (matched by slug). Usage: npm run profiles:import */
import fs from 'node:fs';
import path from 'node:path';
import { getDatabase } from '../database/index.js';
import { listProfiles, saveProfile } from '../modules/provisioning/game-profiles.js';

const dir = path.resolve(process.cwd(), 'data/game-profiles');
const db = getDatabase();
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const input = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as { slug: string };
  const existing = listProfiles(db).find((p) => p.slug === input.slug);
  const saved = saveProfile(db, input, existing?.id);
  console.log(`${existing ? 'Updated' : 'Created'} ${saved.slug} (${saved.configSchema.length} fields, ${saved.installSources.length} sources)`);
}
