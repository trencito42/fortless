import { useState } from 'react';
import { Button, Card, CardHeader, Dialog, LoadingButton, Notice, StatusBadge, Textarea } from '@/design-system';
import type { DiagnosticReportDto } from '../contracts';
import { useService } from '../context';
import { ServiceApiError } from '../ports';

const SEVERITY = { INFO: { tone: 'neutral', label: 'Info' }, WARNING: { tone: 'warn', label: 'Warning' }, CRITICAL: { tone: 'bad', label: 'Critical' } } as const;

/**
 * "Why is my server not working?" Sends the server's recent state (and optional pasted logs) to the diagnostics route.
 * The route is guardrailed on the server and answers 503 AI_NOT_CONFIGURED when no assistant is set up, which is explained, not shown as a failure.
 */
export function DiagnosticsCard() {
  const { id, ports } = useService();
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState('');
  const [report, setReport] = useState<DiagnosticReportDto>();
  const [problem, setProblem] = useState<{ off: boolean; text: string }>();
  const run = async () => {
    setProblem(undefined); setReport(undefined);
    try { setReport(await ports.service.diagnose(id, logs.trim() || undefined)); }
    catch (e) {
      const off = e instanceof ServiceApiError && e.code === ('AI_NOT_CONFIGURED' as never);
      setProblem({ off, text: off ? 'Automatic diagnosis is not set up for this account yet. Check the console output and the knowledge base, or open a ticket.' : e instanceof Error ? e.message : 'The diagnosis could not run.' });
    }
  };
  return (
    <Card pad="lg" className="grid gap-3">
      <CardHeader title="Something wrong?" description="Describe nothing: we look at recent output and suggest the most likely cause." />
      <Dialog
        open={open} onOpenChange={setOpen} title="Diagnose this server" description="Paste log lines if you have them. Without logs we use the server's recent output."
        trigger={<Button variant="secondary" leadingIcon="ai-magic" className="justify-self-start">Diagnose a problem</Button>}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Close</Button><LoadingButton variant="primary" onClick={run}>Run diagnosis</LoadingButton></>}
      >
        <div className="grid gap-4">
          <Textarea label="Logs (optional)" description="Secrets such as tokens are removed before anything is analysed." rows={5} value={logs} onChange={(e) => setLogs(e.target.value)} placeholder="Error: listen EADDRINUSE: address already in use :::3000" />
          {problem ? <Notice tone={problem.off ? 'info' : 'bad'} title={problem.off ? 'Diagnosis is not available' : 'Could not diagnose'}>{problem.text}</Notice> : null}
          {report ? (
            <div className="grid gap-3" role="status" aria-live="polite">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={SEVERITY[report.severity].tone}>{SEVERITY[report.severity].label}</StatusBadge><span className="text-[13px] font-semibold text-ink3">{Math.round(report.confidence * 100)}% confident</span></div>
              <p className="font-semibold">{report.rootCause}</p>
              {report.recommendations.length ? <ol className="grid list-decimal gap-1.5 pl-5 text-ink2">{report.recommendations.map((r) => <li key={r}>{r}</li>)}</ol> : null}
              {report.recommendedArticles.length ? <p className="text-[13.5px] text-ink3">Related: {report.recommendedArticles.map((a) => a.title ?? a.slug).join(', ')}</p> : null}
            </div>
          ) : null}
        </div>
      </Dialog>
    </Card>
  );
}
