import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDatabase } from '../../database/index.js';
import { config } from '../../config/index.js';

export type EmailTemplate = 'email_verification' | 'password_reset' | 'account_invitation' | 'security_alert';

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

export function renderEmail(
  template: EmailTemplate,
  payload: Record<string, unknown>
): { subject: string; text: string; html: string } {
  switch (template) {
    case 'email_verification': {
      const verifyUrl = String(payload['verifyUrl'] || '');
      const name = String(payload['name'] || 'there');
      return {
        subject: 'Verify your Fortless account',
        text: `Hello ${name},\n\nPlease verify your email address for Fortless by visiting:\n${verifyUrl}\n\nThis verification link expires in 24 hours.\n\n— The Fortless Team`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f5f6fa;border-radius:16px;">
          <h2 style="color:#0b1a2b;">Verify your Fortless account</h2>
          <p>Hello ${name},</p>
          <p>Thank you for creating an account with Fortless. Please confirm your email address to activate your workspace:</p>
          <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#2a5fe8;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">Verify Email Address</a></p>
          <p style="color:#5a687b;font-size:13px;">Or copy and paste this URL into your browser:<br>${verifyUrl}</p>
          <p style="color:#5a687b;font-size:12px;margin-top:24px;">This link will expire in 24 hours. If you did not create this account, you can safely ignore this email.</p>
        </div>`,
      };
    }
    case 'password_reset': {
      const resetUrl = String(payload['resetUrl'] || '');
      return {
        subject: 'Reset your Fortless password',
        text: `A password reset was requested for your Fortless account.\n\nReset your password at:\n${resetUrl}\n\nThis link expires in 15 minutes. If you did not request this, please review your account immediately.\n\n— The Fortless Team`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f5f6fa;border-radius:16px;">
          <h2 style="color:#0b1a2b;">Password Reset Request</h2>
          <p>A password reset was requested for your Fortless account.</p>
          <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2a5fe8;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">Reset Password</a></p>
          <p style="color:#5a687b;font-size:13px;">Or copy and paste this URL into your browser:<br>${resetUrl}</p>
          <p style="color:#5a687b;font-size:12px;margin-top:24px;">This link expires in 15 minutes. If you did not request this change, ignore this email or review your account sessions.</p>
        </div>`,
      };
    }
    case 'account_invitation': {
      const inviteUrl = String(payload['inviteUrl'] || '');
      const workspaceName = String(payload['workspaceName'] || 'Fortless Workspace');
      const role = String(payload['role'] || 'MEMBER');
      return {
        subject: `You've been invited to join ${workspaceName} on Fortless`,
        text: `You have been invited to join ${workspaceName} as ${role} on Fortless.\n\nAccept your invitation at:\n${inviteUrl}\n\nThis link expires in 7 days.\n\n— The Fortless Team`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f5f6fa;border-radius:16px;">
          <h2 style="color:#0b1a2b;">Team Invitation</h2>
          <p>You have been invited to join <b>${workspaceName}</b> as a <b>${role}</b> on Fortless.</p>
          <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#2a5fe8;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">Accept Invitation</a></p>
          <p style="color:#5a687b;font-size:13px;">Or copy and paste this URL into your browser:<br>${inviteUrl}</p>
          <p style="color:#5a687b;font-size:12px;margin-top:24px;">This invitation will expire in 7 days.</p>
        </div>`,
      };
    }
    case 'security_alert': {
      const alertTitle = String(payload['title'] || 'Security Alert');
      const details = String(payload['details'] || '');
      return {
        subject: `Security Alert: ${alertTitle} — Fortless`,
        text: `Security Alert: ${alertTitle}\n\n${details}\n\nIf you did not perform this action, please sign in and revoke your device sessions immediately.\n\n— Fortless Security`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f5f6fa;border-radius:16px;">
          <h2 style="color:#b8232a;">Security Alert: ${alertTitle}</h2>
          <p>${details}</p>
          <p style="color:#5a687b;font-size:12px;margin-top:24px;">If you did not perform this action, please sign in to Fortless and revoke all other active sessions immediately.</p>
        </div>`,
      };
    }
  }
}

export function queueEmail(
  trx: Database.Database,
  data: { recipient: string; template: EmailTemplate; subject?: string; payload: Record<string, unknown> }
): string {
  const rendered = renderEmail(data.template, data.payload);
  const id = `eml_${crypto.randomBytes(12).toString('hex')}`;
  trx.prepare(`
    INSERT INTO email_outbox (id, recipient, template, subject, payload_json, status)
    VALUES (?, ?, ?, ?, ?, 'PENDING')
  `).run(
    id,
    data.recipient.trim().toLowerCase(),
    data.template,
    data.subject || rendered.subject,
    JSON.stringify(data.payload)
  );
  return id;
}

export async function processEmailOutbox(
  db: Database.Database = getDatabase()
): Promise<{ processed: number; sent: number; failed: number }> {
  // If email mode is disabled, we do NOT fake success. We leave items pending with note or report 0 sent.
  if (config.EMAIL_MODE === 'disabled') {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const pendingEmails = db.prepare(`
    SELECT * FROM email_outbox
    WHERE status = 'PENDING' AND scheduled_at <= datetime('now', 'utc')
    ORDER BY created_at ASC
    LIMIT 25
  `).all() as EmailRecord[];

  let sent = 0;
  let failed = 0;

  for (const email of pendingEmails) {
    try {
      const payload = JSON.parse(email.payload_json);
      const rendered = renderEmail(email.template, payload);

      if (config.EMAIL_MODE === 'sandbox') {
        ensureSandboxDir();
        const receipt: EmailReceipt = {
          id: email.id,
          recipient: email.recipient,
          subject: rendered.subject,
          template: email.template,
          text: rendered.text,
          html: rendered.html,
          deliveredAt: new Date().toISOString(),
        };
        fs.writeFileSync(
          path.join(SANDBOX_DIR, `${email.id}.json`),
          JSON.stringify(receipt, null, 2),
          'utf8'
        );
      } else if (config.EMAIL_MODE === 'live') {
        // Live transport would invoke authorized vendor SDK (e.g. Postmark / Resend / SES)
        throw new Error('Live email transport is not configured with validated production API credentials.');
      }

      db.prepare(`
        UPDATE email_outbox
        SET status = 'SENT', sent_at = datetime('now', 'utc')
        WHERE id = ?
      `).run(email.id);
      sent++;
    } catch (err: unknown) {
      const errorMsg = (err as Error).message || 'Unknown email delivery failure';
      db.prepare(`
        UPDATE email_outbox
        SET status = 'FAILED', attempts = attempts + 1, last_error = ?
        WHERE id = ?
      `).run(errorMsg, email.id);
      failed++;
    }
  }

  return { processed: pendingEmails.length, sent, failed };
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
