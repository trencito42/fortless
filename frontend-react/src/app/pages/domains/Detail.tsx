import { Button, Card, CardHeader, DescriptionList, Notice, StatusBadge, Switch, TextField } from '@/design-system';
import { DNSRecordEditor, domainStatus, type DnsRecord } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { date, money } from '../../format';
import type { DomainRecord } from '../../domain/types';

function Nameservers({ d }: { d: DomainRecord }) {
  return (
    <Card pad="lg" className="grid gap-3">
      <CardHeader title="Nameservers" description="Where your DNS is hosted. Changes can take up to 48 hours to spread." />
      <TextField label="Nameservers (one per line)" value={d.nameservers.join('\n')} readOnly description="Nameserver updates are not exposed by the DNS backend." />
      <div><Button variant="secondary" disabled>Save nameservers</Button></div>
    </Card>
  );
}

export default function DomainDetail({ name }: { name: string }) {
  const api = useApi();
  const dom = useApiQuery((a) => a.getDomain(name), [name]);
  const dns = useApiQuery((a) => a.dnsRecords(name), [name]);
  return (
    <div className="grid gap-5">
      <PageHeader title={name} crumbs={[{ label: 'Domains & DNS', to: '/app/domains' }, { label: name }]} />
      <CapabilityNote area="domains" />
      <ResourceView res={dom} reload={dom.reload} label="Loading domain">
        {(d) => {
          const s = domainStatus[d.state === 'pending-transfer' ? 'transfer' : d.state === 'pending-registration' ? 'pending' : d.state];
          return (
            <>
              {d.state === 'expiring' ? <Notice tone="warn" title="Expires soon">{d.autoRenew ? 'Auto-renew is on. We will renew it automatically.' : 'Auto-renew is off. Turn it on or renew manually to keep the domain.'}</Notice> : null}
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <Card pad="lg" className="grid gap-4">
                  <CardHeader title="Registration" actions={<StatusBadge tone={s.tone}>{s.label}</StatusBadge>} />
                  <DescriptionList items={[{ label: 'Registered', value: date(d.registeredOn) }, { label: 'Expires', value: date(d.expiresOn) }, { label: 'Renewal price', value: d.renewPrice ? `${money(d.renewPrice)} / year` : 'Not provided by the DNS backend' }, { label: 'Transfer lock', value: d.locked ? 'On' : 'Off' }]} />
                  <Switch label="Auto-renew" description="Updates are not exposed by the domain backend." checked={d.autoRenew} disabled onCheckedChange={() => undefined} />
                  <Switch label="WHOIS privacy" description="Hide your contact details from public lookups." checked={d.privacy} disabled onCheckedChange={() => undefined} />
                </Card>
                <Nameservers d={d} />
              </div>
              <DNSRecordEditor
                domain={d.name} records={dns.status === 'ready' ? (dns.data as DnsRecord[]) : []} loading={dns.status === 'loading'} error={dns.status === 'error' ? dns.error : undefined} onRetry={dns.reload}
                onSave={async (r) => { await api.saveDnsRecord(d.name, r); await dns.reload(); }} onDelete={async (r) => { await api.deleteDnsRecord(d.name, r.id); await dns.reload(); }}
              />
            </>
          );
        }}
      </ResourceView>
    </div>
  );
}
