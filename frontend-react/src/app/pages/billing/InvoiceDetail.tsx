import { useState } from 'react';
import { Notice } from '@/design-system';
import { InvoiceSummary, type Invoice } from '@/features';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApiQuery } from '../../data/DataProvider';
import { PageHeader } from '../../components/PageHeader';
import { date, money } from '../../format';
import type { InvoiceRecord } from '../../domain/types';

const toUi = (i: InvoiceRecord): Invoice => ({ number: i.number, state: i.state, issued: date(i.issuedOn), due: i.dueOn ? date(i.dueOn) : undefined, paidOn: i.paidOn ? date(i.paidOn) : undefined, total: money(i.total), tax: `${i.taxLabel ?? 'Tax'}: ${money(i.tax)}`, lines: i.lines.map((l) => ({ id: l.id, description: l.description, amount: money(l.amount) })) });

export default function InvoiceDetail({ id }: { id: string }) {
  const res = useApiQuery((a) => a.getInvoice(id), [id]);
  const [note, setNote] = useState<{ tone: 'good' | 'bad'; text: string }>();
  return (
    <div className="grid gap-5">
      <PageHeader title="Invoice" crumbs={[{ label: 'Billing', to: '/app/billing' }, { label: 'Invoices', to: '/app/billing/invoices' }, { label: 'Detail' }]} />
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <ResourceView res={res} reload={res.reload} label="Loading invoice">
        {(i) => (
          <div className="grid max-w-3xl gap-4">
            {(i.state === 'open' || i.state === 'overdue') ? <Notice tone="warn">Direct payment for an existing invoice is not exposed by the billing backend.</Notice> : null}
            <InvoiceSummary
              invoice={toUi(i)}
              onPay={async () => setNote({ tone: 'bad', text: 'Direct invoice payment is not exposed by the billing backend.' })}
              onDownload={() => setNote({ tone: 'bad', text: 'Invoice PDF download is not exposed by the billing backend.' })}
            />
          </div>
        )}
      </ResourceView>
    </div>
  );
}
