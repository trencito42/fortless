import { useEffect, useState } from 'react';
import { Card, EmptyState, LoadingButton, Notice } from '@/design-system';
import { ConfigSchemaForm, ExtensionCatalog, useOp } from '@/features';
import type { GameInfoDto } from '../contracts';
import { useService } from '../context';
import { installedKeys, mapGameConfig, mapMods } from '../mappers';
import { useResource } from '../../shared/useResource';
import { ResourceView } from '../../shared/ResourceView';
import { ServerIconCard } from './ServerIconCard';

type WithProfile = Extract<GameInfoDto, { profile: object }>;

function Catalog({ info }: { info: WithProfile }) {
  const { id, ports, can } = useService();
  const sources = info.profile.sources;
  const [kind, setKind] = useState(String(sources[0]?.index ?? 0));
  const [query, setQuery] = useState(''); const [debounced, setDebounced] = useState('');
  const [nonce, setNonce] = useState(0);
  useEffect(() => { const t = setTimeout(() => setDebounced(query), 300); return () => clearTimeout(t); }, [query]);
  const res = useResource(async (s) => {
    const [hits, inst] = await Promise.all([ports.game.searchMods(id, { source: Number(kind), q: debounced, page: 0 }, s), ports.game.installed(id, Number(kind), s)]);
    return mapMods(hits, installedKeys(inst));
  }, [id, ports, kind, debounced, nonce]);
  const canInstall = can('file.create');
  if (!sources.length) return null;
  return (
    <ExtensionCatalog
      title="Install" description={`Search Modrinth for ${sources.map((s) => s.label.toLowerCase()).join(' and ')}. Files are checksum-verified before they reach your server.`}
      kinds={sources.map((s) => ({ id: String(s.index), label: s.label }))} kind={kind} onKindChange={(k) => { setKind(k); }}
      query={query} onQueryChange={setQuery} items={res.status === 'ready' ? res.data.map((x) => (canInstall ? x : { ...x, state: x.state === 'installed' ? 'installed' : 'unavailable', unavailableReason: 'Your access level cannot install files.' })) : []}
      loading={res.status === 'loading'} error={res.status === 'error' ? res.error : undefined} onRetry={res.reload}
      onInstall={async (item) => { await ports.game.installMod(id, { source: Number(kind), projectId: item.id }); setNonce((n) => n + 1); }}
    />
  );
}

export function GameTab() {
  const { id, ports, can, summary } = useService();
  const info = useResource((s) => ports.game.info(id, s), [id, ports]);
  const op = useOp();
  const canWrite = can('file.update');
  return (
    <ResourceView res={info} reload={info.reload} label="Loading game settings">
      {(i) => {
        if (i.profile === null) return <Card pad="lg"><EmptyState icon="layers-01" title="No game tools for this server" description="Fortless does not have a settings profile for this game yet. You can still change files and startup options." /></Card>;
        const withProfile = i as WithProfile;
        const cfg = mapGameConfig(withProfile);
        return (
          <div className="grid gap-4">
            {op.feedback}
            {i.eula === 'required' ? (
              <Notice tone="warn" title="Accept the Minecraft EULA" action={can('control.restart') ? <LoadingButton variant="primary" size="sm" onClick={() => op.run('eula', async () => { await ports.game.acceptEula(id); info.refresh(); }, 'EULA accepted. The server is restarting.').then(() => undefined)}>Accept and restart</LoadingButton> : undefined}>
                The server will not start until the EULA is accepted. By accepting you agree to Mojang's terms at minecraft.net/eula.
              </Notice>
            ) : null}
            {i.java.matches === false && i.java.recommended ? <Notice tone="info" title="A different Java version is recommended">Minecraft {i.java.gameVersion ?? ''} runs best on <code className="font-mono">{i.java.recommended}</code>. This server uses <code className="font-mono">{i.java.current ?? 'an unknown image'}</code>. Change it in Startup.</Notice> : null}
            {summary.state === 'running' ? <Notice tone="info">Most settings apply after the next restart.</Notice> : null}
            <ConfigSchemaForm title={i.profile.name} description={i.profile.configFile ? `Edits ${i.profile.configFile}` : undefined} sections={cfg.sections} initial={cfg.initial}
              disabledReason={canWrite ? undefined : 'Your access level can view these settings but not change them.'}
              onSave={async (changes) => { await ports.game.saveConfig(id, Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, String(v)]))); info.refresh(); }} />
            {i.profile.slug.startsWith('minecraft') ? <ServerIconCard hasIcon={i.profile.icon} onSaved={info.refresh} /> : null}
            {i.profile.sources.length ? <Catalog info={withProfile} /> : null}
          </div>
        );
      }}
    </ResourceView>
  );
}
