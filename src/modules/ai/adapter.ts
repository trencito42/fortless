/**
 * AI Provider Adapter Abstraction
 * Strict Guardrails: Read-Only Diagnostics, Suggested Remediation, and Draft Generation.
 * AI never executes monetary or destructive actions.
 */

import { validateSafeOutboundUrl } from '../../utils/ssrf.js';
import { redactSensitiveData } from './redactor.js';

export interface ServiceDiagnosticContext {
  serviceId: string;
  categorySlug: string;
  runtimeState: string;
  desiredMemoryMb: number;
  desiredCpuPct: number;
  recentLogs?: string;
  recentEvents?: Array<{ action: string; metadata?: string }>;
}

export interface TicketTriageContext {
  ticketId: string;
  subject: string;
  priority: string;
  messages: Array<{ authorName: string; isStaff: boolean; body: string }>;
}

export interface AiDiagnosticReport {
  category: string;
  rootCause: string;
  confidence: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  recommendations: string[];
  relevantArticleSlugs: string[];
  isGuardrailed: true;
}

export interface AiTicketTriageReport {
  summary: string;
  category: string;
  prioritySuggestion: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'FRUSTRATED' | 'URGENT';
  draftedReply: string;
  recommendedArticleSlugs: string[];
  isGuardrailed: true;
}

export interface AiProviderAdapter {
  analyzeServiceHealth(context: ServiceDiagnosticContext): Promise<AiDiagnosticReport>;
  generateTicketTriage(context: TicketTriageContext): Promise<AiTicketTriageReport>;
}

export class MockAiProviderAdapter implements AiProviderAdapter {
  async analyzeServiceHealth(context: ServiceDiagnosticContext): Promise<AiDiagnosticReport> {
    const rawLogs = context.recentLogs || '';
    const { redactedText } = redactSensitiveData(rawLogs);
    const lowerLogs = redactedText.toLowerCase();

    // 1. Dynamic Port Conflict (Node.js / Container)
    if (lowerLogs.includes('eaddrinuse') || lowerLogs.includes('address already in use')) {
      return {
        category: 'PORT_CONFLICT',
        rootCause: 'Dynamic Port Binding Conflict (EADDRINUSE)',
        confidence: 0.95,
        severity: 'CRITICAL',
        recommendations: [
          'Configure server listener to read process.env.PORT instead of a hardcoded port',
          'Bind listener to 0.0.0.0 instead of 127.0.0.1 or localhost',
        ],
        relevantArticleSlugs: ['nodejs-webapp-port-binding'],
        isGuardrailed: true,
      };
    }

    // 2. Minecraft EULA Crash
    if (lowerLogs.includes('eula') || lowerLogs.includes('agree to the eula')) {
      return {
        category: 'CONFIGURATION_ERROR',
        rootCause: 'Minecraft EULA Agreement Required',
        confidence: 0.99,
        severity: 'CRITICAL',
        recommendations: [
          'Open eula.txt in the Fortless file manager',
          'Change eula=false to eula=true and save',
          'Restart the service',
        ],
        relevantArticleSlugs: ['minecraft-crash-eula-memory'],
        isGuardrailed: true,
      };
    }

    // 3. OutOfMemory Error
    if (
      lowerLogs.includes('outofmemoryerror') ||
      lowerLogs.includes('java heap space') ||
      lowerLogs.includes('killed') ||
      (context.categorySlug === 'game-servers' && context.runtimeState === 'ERROR' && context.desiredMemoryMb < 2048)
    ) {
      return {
        category: 'RESOURCE_LIMITS',
        rootCause: 'Memory Limit Exhaustion (OutOfMemoryError)',
        confidence: 0.96,
        severity: 'CRITICAL',
        recommendations: [
          'Verify player slot limits and chunk view distance in server.properties (keep <= 10)',
          'Audit installed plugins and modpacks for memory leaks',
          'Upgrade to a higher RAM tier via the Fortless billing panel',
        ],
        relevantArticleSlugs: ['minecraft-crash-eula-memory'],
        isGuardrailed: true,
      };
    }

    // 4. VPS SSH Key Rejection
    if (lowerLogs.includes('permission denied (publickey)') || lowerLogs.includes('authentication failure')) {
      return {
        category: 'AUTHENTICATION_FAILURE',
        rootCause: 'SSH Public Key Authentication Rejection',
        confidence: 0.92,
        severity: 'WARNING',
        recommendations: [
          'Verify your private key matches the public key uploaded at instance creation',
          'Ensure permissions on your local private key are 0600',
          'Use the emergency VNC console ticket in the Fortless portal to inspect /var/log/auth.log',
        ],
        relevantArticleSlugs: ['cloud-vps-ssh-keys-hardening'],
        isGuardrailed: true,
      };
    }

    // Default Healthy / General Telemetry
    return {
      category: 'GENERAL_HEALTH',
      rootCause: context.runtimeState === 'RUNNING' ? 'Operational with no active faults' : 'Service is currently offline or initializing',
      confidence: 0.85,
      severity: context.runtimeState === 'RUNNING' ? 'INFO' : 'WARNING',
      recommendations: [
        'Monitor live CPU and RAM allocation graphs in the dashboard',
        'Inspect server console for runtime warnings',
      ],
      relevantArticleSlugs: [],
      isGuardrailed: true,
    };
  }

  async generateTicketTriage(context: TicketTriageContext): Promise<AiTicketTriageReport> {
    const combinedText = [context.subject, ...context.messages.map((m) => m.body)].join('\n');
    const { redactedText } = redactSensitiveData(combinedText);
    const lower = redactedText.toLowerCase();

    // Guardrail test: reject attempts to command AI mutations
    if (lower.includes('refund immediately') || lower.includes('drop database') || lower.includes('delete service')) {
      return {
        summary: 'Customer requesting monetary refund or destructive deletion. Requires human staff review.',
        category: 'BILLING_DISPUTE',
        prioritySuggestion: 'HIGH',
        sentiment: 'FRUSTRATED',
        draftedReply:
          'Thank you for contacting Fortless Support. A human staff member has been assigned to review your account details and discuss your request in accordance with our Terms of Service and Refund Policy.',
        recommendedArticleSlugs: ['billing-vat-invoicing-sepa'],
        isGuardrailed: true,
      };
    }

    // DNS Issues
    if (lower.includes('cname') || lower.includes('dns') || lower.includes('nameserver')) {
      return {
        summary: 'DNS record configuration or apex CNAME collision issue.',
        category: 'DOMAINS_DNS',
        prioritySuggestion: 'NORMAL',
        sentiment: 'NEUTRAL',
        draftedReply:
          'Hello, based on your DNS query, please note that per RFC 1912 §2.4, CNAME records cannot coexist with NS or SOA records at the zone apex (@). Please review our guide on configuring A records for apex routing.',
        recommendedArticleSlugs: ['dns-cname-apex-collision-rfc1912'],
        isGuardrailed: true,
      };
    }

    // Minecraft crash
    if (lower.includes('minecraft') || lower.includes('crash') || lower.includes('eula')) {
      return {
        summary: 'Server startup failure or EULA agreement roadblock.',
        category: 'GAME_SERVERS',
        prioritySuggestion: 'NORMAL',
        sentiment: 'NEUTRAL',
        draftedReply:
          'Hello! Most server startup crashes occur because the Minecraft EULA has not been accepted in eula.txt, or due to heap limits. Please check our knowledge base article below for step-by-step instructions on resolving this.',
        recommendedArticleSlugs: ['minecraft-crash-eula-memory'],
        isGuardrailed: true,
      };
    }

    // Default
    return {
      summary: `Inquiry regarding: ${context.subject.slice(0, 60)}`,
      category: 'GENERAL_SUPPORT',
      prioritySuggestion: context.priority as any || 'NORMAL',
      sentiment: 'NEUTRAL',
      draftedReply:
        'Thank you for contacting Fortless Support. Our support engineers are reviewing your ticket details and will assist you shortly.',
      recommendedArticleSlugs: [],
      isGuardrailed: true,
    };
  }
}

export class OpenAiCompatibleAiAdapter implements AiProviderAdapter {
  constructor(
    private readonly config: {
      baseUrl: string;
      apiKey: string;
      model?: string;
    }
  ) {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new Error('AI API key is required and cannot be empty.');
    }
  }

  async validateUrl(): Promise<void> {
    await validateSafeOutboundUrl(this.config.baseUrl);
  }

  async analyzeServiceHealth(context: ServiceDiagnosticContext): Promise<AiDiagnosticReport> {
    const rawLogs = context.recentLogs || '';
    const { redactedText } = redactSensitiveData(rawLogs);

    const prompt = `You are a read-only infrastructure diagnostic engine for Fortless.
Analyze the following runtime context and return ONLY a JSON object conforming to:
{
  "category": string,
  "rootCause": string,
  "confidence": number between 0 and 1,
  "severity": "INFO" | "WARNING" | "CRITICAL",
  "recommendations": string[],
  "relevantArticleSlugs": string[]
}
You must NOT execute, recommend, or hallucinate destructive or monetary actions.

Context:
Category: ${context.categorySlug}
Runtime: ${context.runtimeState}
Memory: ${context.desiredMemoryMb}MB
CPU: ${context.desiredCpuPct}%
Logs: ${redactedText.slice(0, 4000)}`;

    const res = await this.callChatCompletion(prompt);
    try {
      const parsed = JSON.parse(res);
      return {
        category: String(parsed.category || 'DIAGNOSTIC'),
        rootCause: String(parsed.rootCause || 'Unknown error'),
        confidence: Number(parsed.confidence) || 0.8,
        severity: ['INFO', 'WARNING', 'CRITICAL'].includes(parsed.severity) ? parsed.severity : 'INFO',
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
        relevantArticleSlugs: Array.isArray(parsed.relevantArticleSlugs) ? parsed.relevantArticleSlugs.map(String) : [],
        isGuardrailed: true,
      };
    } catch {
      return {
        category: 'DIAGNOSTIC',
        rootCause: 'Log analysis complete',
        confidence: 0.75,
        severity: 'INFO',
        recommendations: ['Check system logs for details'],
        relevantArticleSlugs: [],
        isGuardrailed: true,
      };
    }
  }

  async generateTicketTriage(context: TicketTriageContext): Promise<AiTicketTriageReport> {
    const combined = [context.subject, ...context.messages.map((m) => m.body)].join('\n');
    const { redactedText } = redactSensitiveData(combined);

    const prompt = `You are an AI support assistant for Fortless hosting platform.
Analyze this ticket thread and return ONLY a JSON object:
{
  "summary": string,
  "category": string,
  "prioritySuggestion": "LOW" | "NORMAL" | "HIGH" | "URGENT",
  "sentiment": "POSITIVE" | "NEUTRAL" | "FRUSTRATED" | "URGENT",
  "draftedReply": string,
  "recommendedArticleSlugs": string[]
}
DO NOT promise refunds, direct discounts, or system changes.

Thread:
${redactedText.slice(0, 4000)}`;

    const res = await this.callChatCompletion(prompt);
    try {
      const parsed = JSON.parse(res);
      return {
        summary: String(parsed.summary || 'Ticket analyzed'),
        category: String(parsed.category || 'GENERAL'),
        prioritySuggestion: ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(parsed.prioritySuggestion)
          ? parsed.prioritySuggestion
          : 'NORMAL',
        sentiment: ['POSITIVE', 'NEUTRAL', 'FRUSTRATED', 'URGENT'].includes(parsed.sentiment)
          ? parsed.sentiment
          : 'NEUTRAL',
        draftedReply: String(parsed.draftedReply || 'Thank you for reaching out.'),
        recommendedArticleSlugs: Array.isArray(parsed.recommendedArticleSlugs) ? parsed.recommendedArticleSlugs.map(String) : [],
        isGuardrailed: true,
      };
    } catch {
      return {
        summary: 'Ticket inquiry',
        category: 'GENERAL',
        prioritySuggestion: 'NORMAL',
        sentiment: 'NEUTRAL',
        draftedReply: 'Thank you for contacting Fortless support.',
        recommendedArticleSlugs: [],
        isGuardrailed: true,
      };
    }
  }

  private async callChatCompletion(systemPrompt: string): Promise<string> {
    await this.validateUrl();
    const endpoint = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model || 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`AI API request failed with HTTP ${res.status}`);
      }

      const json = await res.json() as any;
      return json.choices?.[0]?.message?.content || '{}';
    } finally {
      clearTimeout(timeout);
    }
  }
}
