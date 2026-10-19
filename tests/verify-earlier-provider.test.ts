import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../src/utils/ssrf.js', () => ({ validateSafeOutboundUrl: async () => undefined }));
import { PterodactylHttpAdapter } from '../src/modules/provisioning/adapter.js';

afterEach(() => vi.unstubAllGlobals());

describe('FTL-PROV-204: the Pterodactyl status mapping never claims a running process', () => {
  const answer = (attrs: Record<string, unknown>) => vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data: [{ attributes: { id: 4, identifier: 'abcd1234', name: 'n', node: 1, limits: {}, ...attrs } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  const lookup = () => new PterodactylHttpAdapter({ panelUrl: 'https://panel.example.test', apiKey: 'k' }).lookupByCorrelationTag('fortless_x');

  it('reports installing, failed and installed servers as INSTALLING, ERROR and STOPPED', async () => {
    answer({ status: 'installing', suspended: false });
    expect((await lookup())?.status).toBe('INSTALLING');
    answer({ status: 'install_failed', suspended: false });
    expect((await lookup())?.status).toBe('ERROR');
    answer({ status: null, suspended: false });
    expect((await lookup())?.status).toBe('STOPPED');
    answer({ status: null, suspended: true });
    expect((await lookup())?.status).toBe('STOPPED');
  });
});
