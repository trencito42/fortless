import { Button, DescriptionList, EmptyState, Notice } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Section } from '../../components/Cards';
import { ConnectionCard } from '../../components/ConnectionCard';
import { Status, connectionHealth } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { dateTime } from '../../lib/format';

const INFO: Record<string, { scopes: string[]; rotate: string; owner: string }> = {
  PTERODACTYL: { scopes: ['servers: read/write', 'allocations: read', 'nodes: read', 'eggs & nests: read'], rotate: 'Create a new application API key in the panel, set PTERODACTYL_APP_KEY on the server, restart, then delete the old key.', owner: 'Infrastructure' },
  WINGS: { scopes: ['Managed through the panel; no separate credential'], rotate: 'Node tokens are rotated in the panel with “Reset daemon token”.', owner: 'Infrastructure' },
  STRIPE: { scopes: ['payment_intents', 'refunds', 'customers', 'webhook endpoints (read)'], rotate: 'Roll the key in the Stripe dashboard, update STRIPE_SECRET_KEY, restart. Roll the signing secret the same way.', owner: 'Billing' },
  SMTP: { scopes: ['Send mail as the configured sender'], rotate: 'Change the SMTP password at the relay, update SMTP_PASSWORD, restart.', owner: 'Platform' },
  DNS: { scopes: ['Not configured'], rotate: 'No adapter exists yet.', owner: '—' },
};

export default function IntegrationDetail({ id }: { id: string }) {
  const { data } = useAdmin();
  const nav = useNav();
  const c = data.connections.find((x) => x.id === id);
  if (!c) return <AdminPage title="Integration not found"><EmptyState title="No such integration" action={<Button onClick={() => nav('/settings/integrations')}>Back</Button>} /></AdminPage>;
  const info = INFO[c.type]!;
  const nodes = data.nodes.filter((n) => n.connectionId === c.id);
  return (
    <AdminPage detail title={c.name} crumbLabel={c.name} parents={[{ label: 'Integrations', to: '/settings/integrations' }]} status={<Status map={connectionHealth} value={c.health} />} description={c.endpoint}>
      <Columns>
        <ConnectionCard c={c} detail={false} />
        <Section title="Details"><DescriptionList items={[{ label: 'Type', value: c.type }, { label: 'Owner', value: info.owner }, { label: 'Last sync', value: dateTime(c.lastSyncAt) }, { label: 'Last error', value: c.lastError ?? 'None' }, { label: 'Credential', value: c.secret, mono: true }, { label: 'Version', value: c.version ?? '—' }]} /></Section>
      </Columns>
      <Columns>
        <Section title="Scopes used"><ul className="grid list-disc gap-1 pl-5 text-ink2">{info.scopes.map((s) => <li key={s}>{s}</li>)}</ul></Section>
        <Section title="Rotating the credential"><p className="text-ink2">{info.rotate}</p><Notice tone="info" className="mt-3">Credentials are changed on the server, never through the browser, so there is no “reveal” or “edit secret” control.</Notice></Section>
      </Columns>
      {nodes.length ? <Section title="Nodes using this connection"><ul className="flex flex-wrap gap-2">{nodes.map((n) => <li key={n.id} className="rounded-full bg-s2 px-3 py-1.5"><EntityLink to={`/infrastructure/nodes/${n.id}`}>{n.name}</EntityLink></li>)}</ul></Section> : null}
      <PreviewNote />
    </AdminPage>
  );
}
