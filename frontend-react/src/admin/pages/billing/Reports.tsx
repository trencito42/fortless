import { useMemo, useState } from 'react';
import { Button, ChartFrame, Notice, SegmentedControl, TimeSeriesChart } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Section } from '../../components/Cards';
import { RelatedTable } from '../../components/RelatedTable';
import { MoneyText } from '../../components/Money';
import { col } from '../../components/cols';
import { useAdmin } from '../../store';
import { ADMIN_NOW, DAY, money, num } from '../../lib/format';
import { CURRENCIES } from '../../lib/metrics';
import { downloadCsv } from '../../lib/csv';
import { REGION_NAMES } from '../../fixtures/commerce';
import type { Currency } from '../../types';

interface Row { key: string; label: string; invoices: number; net: number; tax: number; total: number; currency: Currency }
type Period = '30' | '90' | '365';

export default function Reports() {
  const { data } = useAdmin();
  const [cur, setCur] = useState<Currency>('EUR');
  const [period, setPeriod] = useState<Period>('90');
  const [by, setBy] = useState<'product' | 'region' | 'cycle'>('product');
  const rows = useMemo<Row[]>(() => {
    const min = ADMIN_NOW - Number(period) * DAY;
    const sv = new Map(data.services.map((s) => [s.id, s]));
    const map = new Map<string, Row>();
    for (const i of data.invoices) {
      if (i.status !== 'PAID' || i.currency !== cur || Date.parse(i.issuedAt) < min) continue;
      const s = i.serviceId ? sv.get(i.serviceId) : undefined;
      const key = by === 'product' ? s?.productName ?? 'Unknown' : by === 'region' ? REGION_NAMES[s?.region ?? ''] ?? 'Unknown' : s?.billing.interval ?? 'Unknown';
      const r = map.get(key) ?? { key, label: key, invoices: 0, net: 0, tax: 0, total: 0, currency: cur };
      r.invoices++; r.net += i.subtotal.amount - i.discount.amount; r.tax += i.tax.amount; r.total += i.total.amount; map.set(key, r);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [data, cur, period, by]);
  const balances = useMemo(() => CURRENCIES.map((c) => ({ c, open: data.invoices.filter((i) => i.status === 'OPEN' && i.currency === c).reduce((a, i) => a + i.total.amount - i.amountPaid.amount, 0), credit: data.customers.filter((x) => x.creditBalance.currency === c).reduce((a, x) => a + x.creditBalance.amount, 0) })), [data]);
  const sum = (k: 'net' | 'tax' | 'total' | 'invoices') => rows.reduce((a, r) => a + r[k], 0);
  return (
    <AdminPage title="Reports" description="Paid invoices grouped by product, region or cycle, plus open balances. One currency at a time; every number is synthetic." actions={<Button variant="secondary" leadingIcon="download-01" onClick={() => downloadCsv(`report-${by}-${cur}-${period}d.csv`, ['group', 'invoices', 'net_minor', 'tax_minor', 'total_minor', 'currency'], rows.map((r) => [r.label, r.invoices, r.net, r.tax, r.total, r.currency]))}>Export CSV</Button>}>
      <Notice tone="warn" title="Synthetic numbers">This report is computed from generated demo invoices. It must not be used for accounting. Tax shown is what the demo invoice says, not a filed return.</Notice>
      <div className="flex flex-wrap gap-3">
        <SegmentedControl aria-label="Currency" size="sm" value={cur} onValueChange={setCur} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        <SegmentedControl aria-label="Period" size="sm" value={period} onValueChange={setPeriod} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '12 months' }]} />
        <SegmentedControl aria-label="Group by" size="sm" value={by} onValueChange={setBy} options={[{ value: 'product', label: 'Product' }, { value: 'region', label: 'Region' }, { value: 'cycle', label: 'Cycle' }]} />
      </div>
      <Columns>
        <ChartFrame title={`Total by ${by}`} description={`${cur}, last ${period} days`} summary={`Paid invoice totals by ${by} in ${cur}`} height={240} state={rows.length ? 'ready' : 'empty'} emptyMessage="No paid invoices in this period and currency.">
          <TimeSeriesChart kind="bar" data={rows.map((r) => ({ label: r.label.length > 14 ? `${r.label.slice(0, 13)}…` : r.label, total: r.total }))} xKey="label" series={[{ key: 'total', label: 'Total', color: 'accent' }]} formatY={(v) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: cur, notation: 'compact', maximumFractionDigits: 0 }).format(v / 100)} label="Report totals" />
        </ChartFrame>
        <Section title="Balances by currency" description="Not converted or added together."><ul className="grid gap-2">{balances.map((b) => <li key={b.c} className="grid gap-1 rounded-md bg-s2 px-3 py-2"><b>{b.c}</b><span className="flex justify-between text-[14px]"><span className="text-ink3">Open receivables</span><MoneyText value={{ amount: b.open, currency: b.c }} /></span><span className="flex justify-between text-[14px]"><span className="text-ink3">Customer credit held</span><MoneyText value={{ amount: b.credit, currency: b.c }} /></span></li>)}</ul></Section>
      </Columns>
      <Section title="Detail">
        <RelatedTable rows={rows} getRowId={(r) => r.key} caption="Report rows" pageSize={12} empty="No paid invoices match." columns={[col<Row>('l', by[0]!.toUpperCase() + by.slice(1), (r) => <b>{r.label}</b>, { primary: true, sort: (r) => r.label }), col<Row>('n', 'Invoices', (r) => num(r.invoices), { numeric: true, sort: (r) => r.invoices }), col<Row>('net', 'Net', (r) => money({ amount: r.net, currency: cur }), { numeric: true, sort: (r) => r.net }), col<Row>('tax', 'Tax', (r) => money({ amount: r.tax, currency: cur }), { numeric: true, sort: (r) => r.tax }), col<Row>('t', 'Total', (r) => money({ amount: r.total, currency: cur }), { numeric: true, sort: (r) => r.total })]} />
        <p className="mt-3 text-[13.5px] font-semibold text-ink2">Totals: {num(sum('invoices'))} invoices · net {money({ amount: sum('net'), currency: cur })} · tax {money({ amount: sum('tax'), currency: cur })} · total {money({ amount: sum('total'), currency: cur })}</p>
      </Section>
    </AdminPage>
  );
}
