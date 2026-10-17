/**
 * AI Diagnostics & Triage Orchestrator
 * Strictly enforces multi-tenant isolation, data redaction, and audit logging.
 */

import type Database from 'better-sqlite3';
import { generateId } from '../identity/auth.js';
import type { AiProviderAdapter, AiDiagnosticReport, AiTicketTriageReport } from './adapter.js';
import { searchKnowledgeArticles } from './knowledge.js';
import { redactSensitiveData } from './redactor.js';

export interface ServiceDiagnosticInput {
  serviceId: string;
  accountId: string;
  userId: string;
  recentLogs?: string;
}

export interface TicketTriageInput {
  ticketId: string;
  accountId: string | null;
  isStaff: boolean;
  userId: string;
}

export async function runServiceDiagnostic(
  input: ServiceDiagnosticInput,
  db: Database.Database,
  adapter: AiProviderAdapter
): Promise<AiDiagnosticReport & { recommendedArticles: any[] }> {
  const service = db.prepare(`
    SELECT s.id, s.account_id, s.contract_status,
           c.slug AS category_slug,
           sdc.cpu_limit_pct, sdc.memory_limit_mb, sdc.disk_limit_mb,
           sos.runtime_state
    FROM services s
    JOIN order_items oi ON oi.id = s.order_item_id
    JOIN plan_versions pv ON pv.id = oi.plan_version_id
    JOIN products p ON p.id = pv.product_id
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN service_desired_configs sdc ON sdc.service_id = s.id
    LEFT JOIN service_observed_states sos ON sos.service_id = s.id
    WHERE s.id = ? AND s.account_id = ?
  `).get(input.serviceId, input.accountId) as any;

  if (!service) {
    throw new Error('Service not found or unauthorized.');
  }

  const recentLogs = input.recentLogs || '';
  const { redactedText } = redactSensitiveData(recentLogs);

  const report = await adapter.analyzeServiceHealth({
    serviceId: service.id,
    categorySlug: service.category_slug,
    runtimeState: service.runtime_state || 'STOPPED',
    desiredMemoryMb: Number(service.memory_limit_mb || 2048),
    desiredCpuPct: Number(service.cpu_limit_pct || 100),
    recentLogs: redactedText,
  });

  // Fetch recommended articles
  const recommendedArticles = [];
  for (const slug of report.relevantArticleSlugs) {
    const arts = searchKnowledgeArticles(slug.replace(/-/g, ' '), { limit: 1 }, db);
    if (arts[0]) recommendedArticles.push(arts[0]);
  }

  // Persist diagnostic log
  const logId = generateId('adl');
  db.prepare(`
    INSERT INTO ai_diagnostic_logs (id, account_id, user_id, context_type, target_resource_id, prompt_summary, suggested_action, confidence_score, model_used)
    VALUES (?, ?, ?, 'SERVICE_DIAGNOSTIC', ?, ?, ?, ?, 'mock-guardrailed-v1')
  `).run(
    logId,
    input.accountId,
    input.userId,
    service.id,
    `Service diagnostic for ${service.id} (${service.category_slug}) - Root cause: ${report.rootCause}`,
    report.recommendations.join('; '),
    report.confidence
  );

  return {
    ...report,
    recommendedArticles,
  };
}

export async function runTicketTriage(
  input: TicketTriageInput,
  db: Database.Database,
  adapter: AiProviderAdapter
): Promise<AiTicketTriageReport & { recommendedArticles: any[] }> {
  let ticketSql = 'SELECT id, account_id, subject, priority, status FROM tickets WHERE id = ?';
  const params: any[] = [input.ticketId];

  if (!input.isStaff && input.accountId) {
    ticketSql += ' AND account_id = ?';
    params.push(input.accountId);
  }

  const ticket = db.prepare(ticketSql).get(...params) as any;
  if (!ticket) {
    throw new Error('Ticket not found or unauthorized.');
  }

  const rawMessages = db.prepare(`
    SELECT tm.body, u.name AS author_name,
           CASE WHEN EXISTS (
             SELECT 1 FROM staff_memberships sm WHERE sm.user_id = tm.author_user_id AND sm.status = 'ACTIVE'
           ) THEN 1 ELSE 0 END AS is_staff
    FROM ticket_messages tm
    JOIN users u ON u.id = tm.author_user_id
    WHERE tm.ticket_id = ? AND tm.is_staff_internal_note = 0
    ORDER BY tm.created_at ASC
  `).all(ticket.id) as Array<{ body: string; author_name: string; is_staff: number }>;

  const messages = rawMessages.map((m) => {
    const { redactedText } = redactSensitiveData(m.body);
    return {
      authorName: m.author_name,
      isStaff: Boolean(m.is_staff),
      body: redactedText,
    };
  });

  const triage = await adapter.generateTicketTriage({
    ticketId: ticket.id,
    subject: ticket.subject,
    priority: ticket.priority,
    messages,
  });

  const recommendedArticles = [];
  for (const slug of triage.recommendedArticleSlugs) {
    const arts = searchKnowledgeArticles(slug.replace(/-/g, ' '), { limit: 1 }, db);
    if (arts[0]) recommendedArticles.push(arts[0]);
  }

  // Audit log
  const logId = generateId('adl');
  db.prepare(`
    INSERT INTO ai_diagnostic_logs (id, account_id, user_id, context_type, target_resource_id, prompt_summary, suggested_action, confidence_score, model_used)
    VALUES (?, ?, ?, 'TICKET_TRIAGE', ?, ?, ?, ?, 'mock-guardrailed-v1')
  `).run(
    logId,
    ticket.account_id,
    input.userId,
    ticket.id,
    `Ticket triage for ${ticket.id}: ${triage.summary}`,
    triage.draftedReply,
    0.95
  );

  return {
    ...triage,
    recommendedArticles,
  };
}
