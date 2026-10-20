import { useState } from 'react';
import { Notice } from '@/design-system';
import { DomainSearch } from '@/features';
import { useApi } from '../../data/DataProvider';
import { useNavigate } from '../../router';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { money } from '../../format';

export default function DomainSearchPage() {
  const api = useApi(); const nav = useNavigate();
  const [added, setAdded] = useState<string>();
  return (
    <div className="grid max-w-3xl gap-5">
      <PageHeader title="Register a domain" description="Search a name; prices include the first year." crumbs={[{ label: 'Domains & DNS', to: '/app/domains' }, { label: 'Register' }]} />
      <CapabilityNote area="domains" />
      {added ? <Notice tone="good" title={`${added} added to your cart`} action={<button type="button" className="font-bold underline" onClick={() => nav('/app/billing/cart')}>Go to cart</button>}>Registration is simulated in this prototype.</Notice> : null}
      <DomainSearch
        onSearch={async (q) => (await api.searchDomains(q)).map((r) => ({ name: r.name, available: r.available, premium: r.premium, price: `${money(r.price)} / year` }))}
        onSelect={async (d) => { const r = (await api.searchDomains(d.name)).find((x) => x.name === d.name); await api.addToCart({ kind: 'domain', title: d.name, detail: '1 year registration', cycle: 'yearly-domain', price: r?.price ?? { amount: 1200, currency: 'EUR' } }); setAdded(d.name); }}
      />
    </div>
  );
}
