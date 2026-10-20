import { Notice } from '@/design-system';
import { ApiKeyManager } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { date } from '../../format';

export default function ApiKeys() {
  const api = useApi();
  const res = useApiQuery((a) => a.apiKeys());
  return (
    <div className="grid max-w-4xl gap-5">
      <PageHeader title="API keys" description="Keys let scripts and CI act on your account. Give each one only the access it needs." crumbs={[{ label: 'Account', to: '/app/account' }, { label: 'API keys' }]} />
      <CapabilityNote area="account" />
      <Notice tone="info">A key is shown once when you create it. Fortless stores only a hash, so a lost key must be replaced.</Notice>
      <ResourceView res={res} reload={res.reload} label="Loading keys">
        {(keys) => <ApiKeyManager keys={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, created: date(k.createdOn), lastUsed: k.lastUsed ? date(k.lastUsed) : undefined }))} onCreate={async (name) => ({ secret: (await api.createApiKey(name, ['services:read'])).secret })} onRevoke={async (k) => api.revokeApiKey(k.id)} />}
      </ResourceView>
    </div>
  );
}
