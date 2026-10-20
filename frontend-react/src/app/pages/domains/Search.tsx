import { useState } from 'react';
import { Notice } from '@/design-system';
import { DomainSearch } from '@/features';
import { useApi } from '../../data/DataProvider';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { money } from '../../format';

export default function DomainSearchPage() {
  const api = useApi();
  const [selected, setSelected] = useState<string>();
  return (
    <div className="grid max-w-3xl gap-5">
      <PageHeader title="Register a domain" description="Search a name; prices include the first year." crumbs={[{ label: 'Domains & DNS', to: '/app/domains' }, { label: 'Register' }]} />
      <CapabilityNote area="domains" />
      <Notice tone="info" title="Search only">The backend can check availability, but domain registration and pricing are not exposed yet. No purchase will be created from this page.</Notice>
      {selected ? <Notice tone="warn" title="Registration unavailable">{selected} cannot be registered until the registrar checkout endpoint is available.</Notice> : null}
      <DomainSearch
        onSearch={async (q) => (await api.searchDomains(q)).map((r) => ({ name: r.name, available: r.available, premium: r.premium, price: r.price ? `${money(r.price)} / year` : 'Price unavailable' }))}
        onSelect={async (d) => setSelected(d.name)}
      />
    </div>
  );
}
