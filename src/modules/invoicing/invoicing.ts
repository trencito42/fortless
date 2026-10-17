import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';

export interface Invoice {
  id: string;
  accountId: string;
  orderId: string | null;
  invoiceNumber: string | null;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'OVERDUE' | 'VOIDED' | 'CREDITED';
  currency: string;
  subtotalMinorUnits: number;
  taxMinorUnits: number;
  totalMinorUnits: number;
  amountPaidMinorUnits: number;
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
}

export function getNextInvoiceNumber(series: string = `INV-${new Date().getUTCFullYear()}`, db: Database.Database = getDatabase()): string {
  return runInTransaction((trx) => {
    trx.prepare(`
      INSERT INTO invoice_sequences (series, current_number)
      VALUES (?, 1)
      ON CONFLICT(series) DO UPDATE SET current_number = current_number + 1
    `).run(series);

    const row = trx.prepare('SELECT current_number FROM invoice_sequences WHERE series = ?').get(series) as { current_number: number };
    const padded = String(row.current_number).padStart(5, '0');
    return `${series}-${padded}`;
  }, db);
}

export function getNextCreditNoteNumber(series: string = `CRN-${new Date().getUTCFullYear()}`, db: Database.Database = getDatabase()): string {
  return runInTransaction((trx) => {
    trx.prepare(`
      INSERT INTO invoice_sequences (series, current_number)
      VALUES (?, 1)
      ON CONFLICT(series) DO UPDATE SET current_number = current_number + 1
    `).run(series);

    const row = trx.prepare('SELECT current_number FROM invoice_sequences WHERE series = ?').get(series) as { current_number: number };
    const padded = String(row.current_number).padStart(5, '0');
    return `${series}-${padded}`;
  }, db);
}

export function markInvoicePaid(invoiceId: string, paidAmountMinorUnits: number, db: Database.Database = getDatabase()): Invoice {
  return runInTransaction((trx) => {
    const invoice = trx.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as ({
      id: string;
      account_id: string;
      order_id: string | null;
      invoice_number: string | null;
      status: string;
      currency: string;
      subtotal_minor_units: number;
      tax_minor_units: number;
      total_minor_units: number;
      amount_paid_minor_units: number;
      due_date: string;
      paid_at: string | null;
      created_at: string;
    }) | undefined;

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found.`);
    }

    if (invoice.status === 'PAID') {
      return {
        id: invoice.id,
        accountId: invoice.account_id,
        orderId: invoice.order_id,
        invoiceNumber: invoice.invoice_number,
        status: 'PAID',
        currency: invoice.currency,
        subtotalMinorUnits: invoice.subtotal_minor_units,
        taxMinorUnits: invoice.tax_minor_units,
        totalMinorUnits: invoice.total_minor_units,
        amountPaidMinorUnits: invoice.amount_paid_minor_units,
        dueDate: invoice.due_date,
        paidAt: invoice.paid_at,
        createdAt: invoice.created_at,
      };
    }

    // Allocate sequential fiscal invoice number if not already present
    const invoiceNumber = invoice.invoice_number || getNextInvoiceNumber(undefined, trx);
    const paidAt = new Date().toISOString();

    trx.prepare(`
      UPDATE invoices
      SET status = 'PAID',
          invoice_number = ?,
          amount_paid_minor_units = ?,
          paid_at = ?
      WHERE id = ?
    `).run(invoiceNumber, paidAmountMinorUnits, paidAt, invoiceId);

    return {
      id: invoice.id,
      accountId: invoice.account_id,
      orderId: invoice.order_id,
      invoiceNumber,
      status: 'PAID',
      currency: invoice.currency,
      subtotalMinorUnits: invoice.subtotal_minor_units,
      taxMinorUnits: invoice.tax_minor_units,
      totalMinorUnits: invoice.total_minor_units,
      amountPaidMinorUnits: paidAmountMinorUnits,
      dueDate: invoice.due_date,
      paidAt,
      createdAt: invoice.created_at,
    };
  }, db);
}

export function listInvoicesForAccount(accountId: string, db: Database.Database = getDatabase()) {
  return db.prepare(`
    SELECT id, invoice_number, status, currency, subtotal_minor_units, tax_minor_units, total_minor_units,
           amount_paid_minor_units, due_date, paid_at, created_at
    FROM invoices
    WHERE account_id = ?
    ORDER BY created_at DESC
  `).all(accountId);
}

export function getInvoiceDetail(invoiceId: string, accountId?: string, db: Database.Database = getDatabase()) {
  let query = 'SELECT * FROM invoices WHERE id = ?';
  const params: string[] = [invoiceId];
  if (accountId) {
    query += ' AND account_id = ?';
    params.push(accountId);
  }

  const invoice = db.prepare(query).get(...params) as Invoice | undefined;
  if (!invoice) return null;

  const lines = db.prepare(`
    SELECT id, description, quantity, unit_price_minor_units, tax_rate_basis_points, total_minor_units
    FROM invoice_lines
    WHERE invoice_id = ?
  `).all(invoiceId);

  const payments = db.prepare(`
    SELECT id, psp_name, psp_session_id, status, amount_minor_units, currency, created_at
    FROM payment_attempts
    WHERE invoice_id = ?
  `).all(invoiceId);

  return { invoice, lines, payments };
}
