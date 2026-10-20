import { useEffect } from 'react';
import { Badge, Button, Card, CardHeader, DescriptionList, LoadingButton, Notice, StatusBadge } from '@/design-system';
import { PlayerRoster, useOp } from '@/features';
import type { GameAdministrationStatusDto } from '../contracts';
import { useService } from '../context';
import { mapModeration, mapPlayers } from '../mappers';
import { useResource } from '../../shared/useResource';
import { ResourceView } from '../../shared/ResourceView';

const STATE_TONE = { CONNECTED: 'good', AVAILABLE: 'good', SETUP_REQUIRED: 'warn', DISABLED: 'warn', UNREACHABLE: 'bad', UNSUPPORTED: 'neutral' } as const;
const STATE_LABEL = { CONNECTED: 'Connected', AVAILABLE: 'Available', SETUP_REQUIRED: 'Setup needed', DISABLED: 'Disabled', UNREACHABLE: 'Unreachable', UNSUPPORTED: 'Unsupported' } as const;
const METHOD = { PTERODACTYL_CONSOLE: 'Native console', GOLDSRC_RCON: 'RCON (GoldSrc)', SOURCE_RCON: 'RCON (Source)', MINECRAFT_RCON: 'RCON (Minecraft)', RUST_WEBRCON: 'WebRCON (Rust)', UNSUPPORTED: 'None' } as const;

/** How Fortless reaches the game for player lists and moderation. Credentials are never shown; the backend stores them encrypted. */
function Administration({ a, onChanged }: { a: GameAdministrationStatusDto; onChanged: () => void }) {
  const { id, ports, can } = useService();
  const op = useOp();
  return (
    <Card pad="lg" className="grid gap-3">
      <CardHeader title="Admin channel" description={a.gameIdentity}
        actions={<StatusBadge tone={STATE_TONE[a.state]}>{STATE_LABEL[a.state]}</StatusBadge>} />
      <p className="text-[14px] text-ink2">{a.message}</p>
      <DescriptionList columns={2} items={[
        { label: 'Used for commands', value: METHOD[a.effectiveProtocol] },
        { label: 'Player list', value: a.capabilities.reliablePlayerList ? 'Reliable' : 'Sampled or best effort' },
        ...(a.lastSuccessfulTestAt ? [{ label: 'Last good test', value: new Date(a.lastSuccessfulTestAt).toLocaleString() }] : []),
      ]} />
      {a.lastTestError ? <Notice tone="bad">Last test failed: {a.lastTestError}</Notice> : null}
      {a.restartRequired ? <Notice tone="warn">Restart the server to apply the admin settings.</Notice> : null}
      {op.feedback}
      <div className="flex flex-wrap gap-2">
        {can('player.moderate') ? <LoadingButton variant="secondary" onClick={() => op.run('test', async () => { await ports.players.testAdministration(id); onChanged(); }, 'Connection test finished.').then(() => undefined)}>Test connection</LoadingButton> : null}
        <LoadingButton variant="secondary" onClick={() => op.run('detect', async () => { await ports.players.detect(id); onChanged(); }, 'Checked again.').then(() => undefined)}>Detect again</LoadingButton>
        {can('startup.update') && (a.state === 'SETUP_REQUIRED' || a.state === 'DISABLED') ? <LoadingButton variant="primary" onClick={() => op.run('auto', async () => { await ports.players.autoConfigure(id, {}); onChanged(); }, 'Admin channel configured.').then(() => undefined)}>Set up automatically</LoadingButton> : null}
        {can('startup.update') && a.configurationSource === 'FORTLESS_OVERRIDE' ? <Button variant="danger-subtle" onClick={() => void op.run('reset', async () => { await ports.players.resetAdministration(id); onChanged(); }, 'Reverted to automatic detection.')}>Reset to automatic</Button> : null}
      </div>
    </Card>
  );
}

export function PlayersTab() {
  const { id, ports, can } = useService();
  const status = useResource((s) => ports.players.status(id, s), [id, ports]);
  const history = useResource((s) => ports.players.history(id, 0, 25, s), [id, ports]);
  useEffect(() => { const t = setInterval(() => status.refresh(), 15000); return () => clearInterval(t); }, [status.refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const op = useOp();
  const after = () => { status.refresh(); history.refresh(); };
  return (
    <ResourceView res={status} reload={status.reload} label="Loading players">
      {(s) => {
        const m = mapPlayers(s);
        const cap = s.administration?.capabilities ?? { kick: false, ban: false, unban: false };
        return (
          <PlayerRoster
            status={m.status} message={s.error ?? s.administration?.message} info={m.info} reliability={s.playerListReliability} players={m.players}
            capabilities={cap} canModerate={can('player.moderate')}
            onKick={async (p, reason) => { await ports.players.kick(id, { targetIdentifier: p.identifier, targetName: p.name, reason }); after(); }}
            onBan={async (p, o) => { await ports.players.ban(id, { targetIdentifier: p.identifier, targetName: p.name, reason: o.reason, durationMinutes: o.durationMinutes }); after(); }}
            onUnban={async (r) => { await ports.players.unban(id, { targetIdentifier: r.targetIdentifier, targetName: r.targetName }); after(); }}
            history={history.status === 'ready' ? mapModeration(history.data) : []} historyLoading={history.status === 'loading'} historyError={history.status === 'error' ? history.error : undefined} onHistoryRetry={history.reload}
            administration={<>{op.feedback}{s.administration ? <Administration a={s.administration} onChanged={after} /> : s.state === 'UNSUPPORTED' ? <Badge tone="neutral">No admin channel for this game</Badge> : null}</>}
          />
        );
      }}
    </ResourceView>
  );
}
