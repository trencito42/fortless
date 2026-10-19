import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { getDatabase } from '../../database/index.js';
import { config } from '../../config/index.js';
import mailTemplates from './fortless-mail-templates.json' with { type: 'json' };
import { isOptionalEmailEnabled, type OptionalEmailCategory } from '../notifications/preferences.js';

export type EmailTemplate =
  | 'email_verification'
  | 'welcome'
  | 'password_reset'
  | 'password_changed'
  | 'account_invitation'
  | 'service_invitation'
  | 'security_alert'
  | 'mfa_changed'
  | 'invoice_issued'
  | 'payment_confirmed'
  | 'payment_receipt'
  | 'payment_failed'
  | 'renewal_reminder'
  | 'service_provisioned'
  | 'service_ready'
  | 'ticket_reply'
  | 'cancellation_scheduled';

export interface EmailRecord {
  id: string;
  recipient: string;
  template: EmailTemplate;
  subject: string;
  payload_json: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  attempts: number;
  last_error: string | null;
  scheduled_at: string;
  sent_at: string | null;
  created_at: string;
}

export interface EmailReceipt {
  id: string;
  recipient: string;
  subject: string;
  template: EmailTemplate;
  text: string;
  html: string;
  deliveredAt: string;
}

const SANDBOX_DIR = path.resolve(process.cwd(), 'data', 'sandbox_mail');

function ensureSandboxDir(): void {
  if (!fs.existsSync(SANDBOX_DIR)) {
    fs.mkdirSync(SANDBOX_DIR, { recursive: true });
  }
}

type CanonicalMail = { name: string; subject: string; text: string; html: string };
const canonicalTemplates = mailTemplates as Record<string, CanonicalMail>;

const canonicalTemplateId: Record<EmailTemplate, string> = {
  email_verification: 'email_verification',
  welcome: 'welcome',
  password_reset: 'password_reset',
  password_changed: 'password_changed',
  account_invitation: 'account_invitation',
  service_invitation: 'account_invitation',
  security_alert: 'security_alert',
  mfa_changed: 'mfa_changed',
  invoice_issued: 'invoice_issued',
  payment_confirmed: 'payment_receipt',
  payment_receipt: 'payment_receipt',
  payment_failed: 'payment_failed',
  renewal_reminder: 'renewal_reminder',
  service_provisioned: 'service_ready',
  service_ready: 'service_ready',
  ticket_reply: 'ticket_reply',
  cancellation_scheduled: 'cancellation_scheduled',
};

const optionalCategory: Partial<Record<EmailTemplate, OptionalEmailCategory>> = {
  invoice_issued: 'billing', payment_confirmed: 'billing', payment_receipt: 'billing',
  renewal_reminder: 'billing', cancellation_scheduled: 'billing',
  service_provisioned: 'service', service_ready: 'service', ticket_reply: 'support',
};

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}

/**
 * The canonical previews use an Outlook VML branch plus an `if !mso` branch.
 * SOGo's sanitizer can retain the conditional comment while dropping its CTA,
 * leaving an empty table above the fallback URL. A normal table-based anchor is
 * supported by all clients we target, including current Outlook, so deliver one
 * unambiguous CTA instead of mutually exclusive comment branches.
 */
function normalizeEmailCtas(html: string): string {
  return html
    .replace(/<!--\[if mso\]><v:roundrect[\s\S]*?<\/v:roundrect><!\[endif\]-->\s*/g, '')
    .replace(/<!--\[if !mso\]><!-->/g, '')
    .replace(/<!--<!\[endif\]-->/g, '');
}

function readableDate(value: unknown, fallback: string): string {
  const raw = String(value || '');
  const parsed = new Date(raw);
  if (!raw || Number.isNaN(parsed.getTime())) return raw || fallback;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(parsed);
}

function templateReplacements(payload: Record<string, unknown>): Array<[string, string]> {
  const name = String(payload['name'] || 'there');
  const serviceName = String(payload['serviceName'] || payload['planName'] || 'your service');
  const invoice = String(payload['invoiceNumber'] || 'your invoice');
  const amount = String(payload['amount'] || 'the invoice total');
  const subject = String(payload['subject'] || 'Support ticket');
  const preview = String(payload['preview'] || 'There is a new reply in your support conversation.');
  const author = String(payload['author'] || 'Fortless Support');
  const workspace = String(payload['workspaceName'] || payload['serviceName'] || 'your Fortless workspace');
  const inviter = String(payload['inviterName'] || 'A workspace owner');
  const endDate = readableDate(payload['endDate'], 'the end of the current period');
  const address = String(payload['address'] || 'Open Fortless to view the connection address');
  const inviteUrl = String(payload['inviteUrl'] || 'https://fortless.net/register');
  const ticketId = String(payload['ticketId'] || 'Support ticket');
  const region = String(payload['region'] || 'See service details');
  const role = String(payload['role'] || payload['access'] || 'Member');
  const date = readableDate(payload['date'] || payload['endDate'], 'See Fortless for details');
  const tax = String(payload['tax'] || 'See invoice');
  const paymentMethod = String(payload['paymentMethod'] || 'Saved payment method');
  return [
    ['Alex Morgan', inviter], ['Morgan Hosting', workspace], ['Technical Administrator', role],
    ['Hi Alex,', 'Hi ' + name + ','], ['Thanks, Alex.', 'Thanks, ' + name + '.'],
    ['https://fortless.net/verify-email?token=sample-token-0000', String(payload['verifyUrl'] || 'https://fortless.net/verify-email')],
    ['https://fortless.net/reset-password?token=sample-token-0000', String(payload['resetUrl'] || 'https://fortless.net/reset-password')],
    ['https://fortless.net/register?invite=sample-token', inviteUrl],
    ['FL-2026-0044', invoice], ['€27.90', amount], ['€14.90', amount], ['€7.90', amount], ['€3.90', amount], ['€6.90', amount],
    ['Minecraft Survival 4 GB', serviceName], ['Survival 4 GB', serviceName], ['Starter 2 GB', serviceName],
    ['Modded 8 GB', serviceName], ['Bot Standard', serviceName], ['Node.js Starter', serviceName], ['Node.js App Starter', serviceName],
    ['fra-gs-03.fortless.net:25565', address], ['mc.fortless.net:25565', address], ['Frankfurt', region],
    ['Server stuck on Installing after order', subject], ['tkt_0912', ticketId],
    ['Thanks. The install job timed out on our side, so we re-queued it. Please check again in a few minutes.', preview],
    ['Mira, support', author], ['Nov 14, 2026', endDate], ['Oct 23, 2026', endDate],
    ['Nov 2, 2026', date], ['Oct 16', date], ['Oct 2, 2026', date], ['Oct 3, 2026', date],
    ['€4.78', tax], ['Card ending 4242', paymentMethod],
  ];
}

export function renderEmail(
  template: EmailTemplate,
  payload: Record<string, unknown>
): { subject: string; text: string; html: string } {
  const canonical = canonicalTemplates[canonicalTemplateId[template]];
  if (!canonical) throw new Error('Missing canonical Fortless Mail template: ' + template);
  const plain = templateReplacements(payload);
  if (template === 'mfa_changed' && payload['enabled'] === false) {
    plain.push(
      ['Two-step verification turned on', 'Two-step verification turned off'],
      ['TWO-STEP IS ON.', 'TWO-STEP IS OFF.'],
      ['Sign-ins now need a code from your authenticator app.', 'Sign-ins no longer require a code from your authenticator app.'],
      ['Keep your recovery codes somewhere safe. Each works once.', 'Your authenticator factor and unused recovery codes were removed.'],
    );
  }
  // NEW-401: every replacement happens in ONE pass over the template. A value inserted for one field is never scanned
  // again, so customer-controlled text (a server or workspace name) cannot be rewritten by a later sample string or
  // expanded as a {{placeholder}}.
  const semantic = new Map<string, string>();
  for (const [key, val] of Object.entries(payload)) {
    if (val !== undefined && val !== null && typeof val !== 'object') semantic.set(key, String(val));
  }
  const render = (source: string, escape: (v: string) => string): string => {
    const direct = new Map<string, string>();
    for (const [sample, actual] of plain) if (!direct.has(sample)) direct.set(sample, escape(actual));
    const parts = [...direct.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    parts.push('\\{\\{\\s*[A-Za-z0-9_]+\\s*\\}\\}');
    const pattern = new RegExp(parts.join('|'), 'g');
    return source.replace(pattern, (match) => {
      if (match.startsWith('{{')) {
        const key = match.slice(2, -2).trim();
        return semantic.has(key) ? escape(semantic.get(key)!) : match;
      }
      return direct.get(match) ?? match;
    });
  };
  const subject = render(canonical.subject, (v) => v);
  const text = render(canonical.text, (v) => v);
  const html = normalizeEmailCtas(render(canonical.html, htmlEscape));

  return { subject, text, html };
}

export function queueEmail(
  trx: Database.Database,
  data: { recipient: string; template: EmailTemplate; subject?: string; payload: Record<string, unknown> }
): string {
  const recipient = data.recipient.trim().toLowerCase();
  const category = optionalCategory[data.template];
  if (category && !isOptionalEmailEnabled(recipient, category, trx)) return '';
  const rendered = renderEmail(data.template, data.payload);
  const id = `eml_${crypto.randomBytes(12).toString('hex')}`;
  trx.prepare(`
    INSERT INTO email_outbox (id, recipient, template, subject, payload_json, status)
    VALUES (?, ?, ?, ?, ?, 'PENDING')
  `).run(
    id,
    recipient,
    data.template,
    data.subject || rendered.subject,
    JSON.stringify(data.payload)
  );

  if (config.EMAIL_MODE !== 'disabled') {
    setTimeout(() => {
      processEmailOutbox().catch((err) => {
        console.error('[EmailOutbox] Async dispatch error:', err);
      });
    }, 50);
  }

  return id;
}

export interface EmailTransportMessage {
  id: string;
  recipient: string;
  subject: string;
  text: string;
  html: string;
  template: EmailTemplate;
}

export interface EmailTransportAdapter {
  readonly mode: 'sandbox' | 'live' | 'disabled';
  send(message: EmailTransportMessage): Promise<{ messageId: string }>;
}

export class SandboxEmailTransportAdapter implements EmailTransportAdapter {
  readonly mode = 'sandbox' as const;

  async send(message: EmailTransportMessage): Promise<{ messageId: string }> {
    ensureSandboxDir();
    const receipt: EmailReceipt = {
      id: message.id,
      recipient: message.recipient,
      subject: message.subject,
      template: message.template,
      text: message.text,
      html: message.html,
      deliveredAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(SANDBOX_DIR, `${message.id}.json`),
      JSON.stringify(receipt, null, 2),
      'utf8'
    );
    return { messageId: `sbx_${message.id}` };
  }
}

export class SmtpEmailTransportAdapter implements EmailTransportAdapter {
  readonly mode = 'live' as const;
  private transporter: Transporter | null = null;

  constructor(
    private readonly host: string = config.SMTP_HOST,
    private readonly port: number = config.SMTP_PORT,
    private readonly secure: boolean = config.SMTP_SECURE,
    private readonly user: string = config.SMTP_USER,
    private readonly pass: string = config.SMTP_PASSWORD,
    private readonly from: string = config.EMAIL_FROM
  ) {}

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.secure,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 45_000,
        auth: {
          user: this.user,
          pass: this.pass,
        },
      });
    }
    return this.transporter;
  }

  async send(message: EmailTransportMessage): Promise<{ messageId: string }> {
    if (!this.pass || !this.host) {
      throw new Error(`[SMTP] Live email delivery requires SMTP credentials (host and password). Delivery aborted.`);
    }
    const transporter = this.getTransporter();
    const info = await transporter.sendMail({
      from: this.from,
      to: message.recipient,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { messageId: info.messageId || `smtp_${message.id}` };
  }
}

export class ProductionEmailTransportAdapter implements EmailTransportAdapter {
  readonly mode = 'live' as const;

  constructor(
    private readonly apiKey: string = process.env['EMAIL_PROVIDER_API_KEY'] || '',
    private readonly provider: string = process.env['EMAIL_PROVIDER'] || 'unconfigured'
  ) {}

  async send(_message: EmailTransportMessage): Promise<{ messageId: string }> {
    if (!this.apiKey || this.provider === 'unconfigured') {
      throw new Error(
        `ProductionEmailTransportAdapter: Live email delivery is unconfigured. ` +
        `Environment variable EMAIL_PROVIDER_API_KEY is not set or provider is unsupported.`
      );
    }
    throw new Error(
      `ProductionEmailTransportAdapter: Provider "${this.provider}" configured but network egress requires manual operator verification.`
    );
  }
}

let customEmailTransport: EmailTransportAdapter | null = null;

export function setEmailTransport(transport: EmailTransportAdapter): void {
  customEmailTransport = transport;
}

export function getEmailTransport(): EmailTransportAdapter {
  if (customEmailTransport) return customEmailTransport;
  if (config.EMAIL_MODE === 'sandbox') return new SandboxEmailTransportAdapter();
  if (config.EMAIL_MODE === 'live' || Boolean(config.SMTP_PASSWORD)) {
    return new SmtpEmailTransportAdapter();
  }
  return new SandboxEmailTransportAdapter();
}

export interface ProcessEmailOptions {
  workerId?: string;
  leaseDurationMs?: number;
  batchSize?: number;
  maxAttempts?: number;
}

export async function processEmailOutbox(
  db: Database.Database = getDatabase(),
  transport: EmailTransportAdapter = getEmailTransport(),
  options: ProcessEmailOptions = {}
): Promise<{ processed: number; sent: number; failed: number; deadLettered: number }> {
  if (transport.mode === 'disabled' || (!customEmailTransport && config.EMAIL_MODE === 'disabled')) {
    return { processed: 0, sent: 0, failed: 0, deadLettered: 0 };
  }

  const workerId = options.workerId || `eml_wkr_${crypto.randomBytes(8).toString('hex')}`;
  // NEW-402: the lease outlasts the SMTP timeouts below, so a slow server cannot cause a second worker to resend.
  const leaseDurationMs = options.leaseDurationMs || 300_000;
  const batchSize = options.batchSize || 25;
  const maxAttempts = options.maxAttempts || 5;

  const leaseExpiresAt = new Date(Date.now() + leaseDurationMs).toISOString();

  // 1. Recover expired leases
  db.prepare(`
    UPDATE email_outbox
    SET status = 'PENDING',
        lease_token = NULL,
        lease_expires_at = NULL,
        attempts = attempts + 1,
        scheduled_at = datetime('now', 'utc')
    WHERE status = 'PROCESSING'
      AND (
        (lease_expires_at IS NOT NULL AND lease_expires_at <= datetime('now', 'utc'))
        OR
        (lease_expires_at IS NULL AND scheduled_at <= datetime('now', '-5 minutes', 'utc'))
      )
  `).run();

  // 2. Concurrency-safe atomic claim inside transaction
  const claimedEmails = db.transaction(() => {
    const candidates = db.prepare(`
      SELECT id FROM email_outbox
      WHERE (
        status = 'PENDING' AND scheduled_at <= datetime('now', 'utc')
      ) OR (
        status = 'PROCESSING' AND lease_expires_at IS NOT NULL AND lease_expires_at <= datetime('now', 'utc')
      )
      ORDER BY created_at ASC
      LIMIT ?
    `).all(batchSize) as { id: string }[];

    if (candidates.length === 0) return [];

    const ids = candidates.map((c) => c.id);
    const placeholders = ids.map(() => '?').join(',');

    db.prepare(`
      UPDATE email_outbox
      SET status = 'PROCESSING',
          lease_token = ?,
          lease_expires_at = ?,
          scheduled_at = datetime('now', 'utc')
      WHERE id IN (${placeholders})
        AND (
          status = 'PENDING'
          OR (status = 'PROCESSING' AND lease_expires_at IS NOT NULL AND lease_expires_at <= datetime('now', 'utc'))
        )
    `).run(workerId, leaseExpiresAt, ...ids);

    return db.prepare(`
      SELECT * FROM email_outbox
      WHERE lease_token = ? AND status = 'PROCESSING'
      ORDER BY created_at ASC
    `).all(workerId) as EmailRecord[];
  })();

  let sent = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const email of claimedEmails) {
    try {
      const payload = JSON.parse(email.payload_json);
      const rendered = renderEmail(email.template, payload);

      await transport.send({
        id: email.id,
        recipient: email.recipient,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        template: email.template,
      });

      db.prepare(`
        UPDATE email_outbox
        SET status = 'SENT',
            payload_json = json_remove(payload_json, '$.verifyUrl', '$.resetUrl', '$.inviteUrl'),
            sent_at = datetime('now', 'utc'),
            last_error = NULL,
            lease_token = NULL,
            lease_expires_at = NULL
        WHERE id = ? AND lease_token = ?
      `).run(email.id, workerId);
      sent++;
    } catch (err: unknown) {
      const errorMsg = (err as Error).message || 'Unknown email delivery failure';
      const newAttempts = email.attempts + 1;
      const isDeadLetter = newAttempts >= maxAttempts;

      if (isDeadLetter) {
        db.prepare(`
          UPDATE email_outbox
          SET status = 'DEAD_LETTER',
              payload_json = json_remove(payload_json, '$.verifyUrl', '$.resetUrl', '$.inviteUrl'),
              attempts = ?,
              last_error = ?,
              dead_lettered_at = datetime('now', 'utc'),
              lease_token = NULL,
              lease_expires_at = NULL
          WHERE id = ? AND lease_token = ?
        `).run(newAttempts, errorMsg, email.id, workerId);
        deadLettered++;
      } else {
        const backoffSec = Math.min(600, 30 * Math.pow(2, Math.max(0, newAttempts - 1)));
        db.prepare(`
          UPDATE email_outbox
          SET status = 'PENDING',
              attempts = ?,
              last_error = ?,
              lease_token = NULL,
              lease_expires_at = NULL,
              scheduled_at = datetime('now', '+' || ? || ' seconds')
          WHERE id = ? AND lease_token = ?
        `).run(newAttempts, errorMsg, backoffSec, email.id, workerId);
      }
      failed++;
    }
  }

  return { processed: claimedEmails.length, sent, failed, deadLettered };
}

export function getSandboxReceipts(): EmailReceipt[] {
  ensureSandboxDir();
  const files = fs.readdirSync(SANDBOX_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(SANDBOX_DIR, f), 'utf8')) as EmailReceipt);
}

export function clearSandboxReceipts(): void {
  ensureSandboxDir();
  const files = fs.readdirSync(SANDBOX_DIR).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    fs.unlinkSync(path.join(SANDBOX_DIR, file));
  }
}

