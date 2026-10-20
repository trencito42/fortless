import { useEffect, useState } from 'react';
import { Button, Card, CardHeader, DescriptionList, Notice, StatusBadge, Switch, TextField } from '@/design-system';
import { DNSRecordEditor, domainStatus, type DnsRecord } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApi, useApiQuery } from '../../data/DataProvider';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { date, money } from '../../format';
import type { DomainRecord } from '../../domain/types';

function Nameservers({ d }: { d: DomainRecord }) {
  const api = useApi();
  const [ns, setNs] = useState(d.nameservers.join('\n'));
  const [note, setNote] = useState<{ tone: 'good' | 'bad'; text: string }>();
  useEffect(() => setNs(d.nameservers.join('\n')), [d.nameservers]);
  return (
    <Card pad="lg" className="grid gap-3">
      <CardHeader title="Nameservers" description="Where your DNS is hosted. Changes can take up to 48 hours to spread." />
      <TextField label="Nameservers (one per line)" value={ns} onChange={(e) => setNs(e.target.value)} description="Use at least two." />
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <div><Button variant="secondary" onClick={() => { setNote(undefined); api.saveNameservers(d.name, ns.split(/[\s,]+/).filter(Boolean)).then(() => setNote({ tone: 'good', text: 'Nameservers saved.' }), (e: Error) => setNote({ tone: 'bad', text: e.message })); }}>Save nameservers</Button></div>
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
                  <DescriptionList items={[{ label: 'Registered', value: date(d.registeredOn) }, { label: 'Expires', value: date(d.expiresOn) }, { label: 'Renewal price', value: `${money(d.renewPrice)} / year` }, { label: 'Transfer lock', value: d.locked ? 'On' : 'Off' }]} />
                  <Switch label="Auto-renew" description="Charge your default card before it expires." checked={d.autoRenew} onCheckedChange={(on) => void api.setDomainAutoRenew(d.name, on)} />
                  <Switch label="WHOIS privacy" description="Hide your contact details from public lookups." checked={d.privacy} disabled onCheckedChange={() => undefined} />
                </Card>
                <Nameservers d={d} />
              </div>
              <DNSRecordEditor
                domain={d.name} records={dns.status === 'ready' ? (dns.data as DnsRecord[]) : []} loading={dns.status === 'loading'} error={dns.status === 'error' ? dns.error : undefined} onRetry={dns.reload}
                onSave={async (r) => { await api.saveDnsRecord(d.name, r); }} onDelete={async (r) => { await api.deleteDnsRecord(d.name, r.id); }}
              />
            </>
          );
        }}
      </ResourceView>
    </div>
  );
}
