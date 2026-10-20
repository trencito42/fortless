import { Button, Card, DescriptionList, StatusBadge } from '@/design-system';
import { invoiceStatus, type InvoiceState } from './status';

export interface InvoiceLine { id: string; description: string; /** Amount already formatted with currency, e.g. "€6.00". */ amount: string }
export interface Invoice { number: string; state: InvoiceState; issued: string; due?: string; total: string; tax?: string; lines: InvoiceLine[]; paidOn?: string }

export interface InvoiceSummaryProps {
  invoice: Invoice;
  onPay?: () => void | Promise<void>;
  /** Link to the PDF the backend generated. The app decides how to fetch it (auth headers). */
  onDownload?: () => void | Promise<void>;
}

/** One invoice: status, dates, lines, total and the two actions that matter (pay, download). All amounts arrive formatted; nothing is calculated here. */
export function InvoiceSummary({ invoice: i, onPay, onDownload }: InvoiceSummaryProps) {
  const s = invoiceStatus[i.state];
  const payable = i.state === 'open' || i.state === 'overdue';
  return (
    <Card pad="lg" className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1"><h2 className="text-[22px] font-extrabold tracking-[-0.04em]">Invoice {i.number}</h2><StatusBadge tone={s.tone}>{s.label}</StatusBadge></div>
        <div className="flex flex-wrap gap-2">
          {onDownload ? <Button variant="secondary" leadingIcon="download-01" onClick={onDownload}>Download PDF</Button> : null}
          {payable && onPay ? <Button variant="primary" leadingIcon="credit-card" onClick={onPay}>Pay {i.total}</Button> : null}
        </div>
      </header>
      <DescriptionList columns={2} items={[{ label: 'Issued', value: i.issued }, ...(i.due ? [{ label: 'Due', value: i.due }] : []), ...(i.paidOn ? [{ label: 'Paid on', value: i.paidOn }] : [])]} />
      <table className="w-full text-left text-[14px]">
        <caption className="sr-only">Invoice lines</caption>
        <thead><tr className="text-ink3"><th scope="col" className="py-2 text-[12.5px] font-bold">Description</th><th scope="col" className="py-2 text-right text-[12.5px] font-bold">Amount</th></tr></thead>
        <tbody>{i.lines.map((l) => <tr key={l.id}><td className="py-2 pr-4">{l.description}</td><td className="py-2 text-right font-semibold tabular-nums">{l.amount}</td></tr>)}</tbody>
        <tfoot>
          {i.tax ? <tr><th scope="row" className="pt-3 text-ink3">Tax</th><td className="pt-3 text-right tabular-nums">{i.tax}</td></tr> : null}
          <tr><th scope="row" className="pt-2 text-[16px]">Total</th><td className="pt-2 text-right text-[18px] font-extrabold tabular-nums">{i.total}</td></tr>
        </tfoot>
      </table>
    </Card>
  );
}
