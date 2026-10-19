/**
 * Prints why the FastDL tab is (not) shown for one service: the panel's egg name, the profile it resolves to
 * and the service's access state. Read-only. Usage: npx tsx src/scripts/fastdl-diagnose.ts <serviceId>
 */
import { getDatabase } from '../database/index.js';
import { config } from '../config/index.js';
import { PterodactylHttpAdapter } from '../modules/provisioning/adapter.js';
import { resolveFastDlProfile } from '../modules/fastdl/profiles.js';

async function main() {
  const serviceId = process.argv[2];
  if (!serviceId) { console.error('usage: fastdl-diagnose <serviceId>'); process.exit(2); }
  const db = getDatabase();
  const svc = db.prepare('SELECT id, account_id, provider_type, external_id, contract_status FROM services WHERE id = ?').get(serviceId) as
    { id: string; account_id: string; provider_type: string; external_id: string | null; contract_status: string } | undefined;
  if (!svc) { console.error('service not found'); process.exit(1); }
  console.log('service:', svc.id, svc.provider_type, svc.contract_status, 'panel server', svc.external_id);
  if (!config.PTERODACTYL_PANEL_URL || !config.PTERODACTYL_API_KEY || !svc.external_id) { console.log('panel not configured or service not provisioned'); return; }
  const adapter = new PterodactylHttpAdapter({ panelUrl: config.PTERODACTYL_PANEL_URL, apiKey: config.PTERODACTYL_API_KEY });
  const egg = await adapter.getServerEggName(svc.external_id);
  const profile = resolveFastDlProfile(egg);
  console.log('egg name from panel:', JSON.stringify(egg));
  console.log('FastDL profile:', profile ? `${profile.slug} (${profile.engine})` : 'none: the tab is hidden for this egg');
}

main().catch((e) => { console.error('failed:', String(e?.message ?? e)); process.exit(1); });
