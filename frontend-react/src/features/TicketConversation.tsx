import { useState } from 'react';
import { Avatar, Button, Card, Dropzone, LoadingButton, StatusBadge, Textarea } from '@/design-system';
import { ticketStatus, type TicketState } from './status';

export interface TicketMessage { id: string; author: string; fromStaff: boolean; time: string; body: string; attachments?: { name: string }[] }
export interface TicketConversationProps {
  subject: string;
  state: TicketState;
  messages: TicketMessage[];
  onReply: (body: string, files: File[]) => Promise<void>;
  onClose?: () => Promise<void>;
}

/** Support thread: messages oldest first, reply box that stays disabled once the ticket is closed. Message bodies render as plain text. */
export function TicketConversation({ subject, state, messages, onReply, onClose }: TicketConversationProps) {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const s = ticketStatus[state];
  const send = async () => {
    if (!body.trim()) { setErr('Write a message first.'); return; }
    setErr(null);
    try { await onReply(body.trim(), files); setBody(''); setFiles([]); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send. Your message is kept.'); }
  };
  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-[22px] font-extrabold tracking-[-0.04em]">{subject}</h2><div className="flex items-center gap-2"><StatusBadge tone={s.tone}>{s.label}</StatusBadge>{onClose && state !== 'closed' ? <Button size="sm" variant="secondary" onClick={onClose}>Close ticket</Button> : null}</div></header>
      <ol aria-label="Messages" className="grid gap-3">
        {messages.map((m) => (
          <li key={m.id} className={m.fromStaff ? 'justify-self-start' : 'justify-self-end'} style={{ maxWidth: 'min(640px, 92%)' }}>
            <Card surface={m.fromStaff ? 'raised' : 'sunken'} className="grid gap-2">
              <div className="flex items-center gap-2"><Avatar initials={m.author.slice(0, 2).toUpperCase()} size="sm" tone={m.fromStaff ? 'accent' : 'ink'} /><b>{m.author}</b>{m.fromStaff ? <StatusBadge tone="accent" dot={false}>Support</StatusBadge> : null}<span className="ml-auto text-[12.5px] text-ink3">{m.time}</span></div>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              {m.attachments?.length ? <ul className="flex flex-wrap gap-1.5">{m.attachments.map((a) => <li key={a.name} className="rounded-full bg-s3 px-2.5 py-1 text-[12.5px] font-semibold">{a.name}</li>)}</ul> : null}
            </Card>
          </li>
        ))}
      </ol>
      {state === 'closed' ? <p className="rounded-md bg-s2 px-4 py-3 font-semibold text-ink3">This ticket is closed. Open a new ticket if you still need help.</p> : (
        <Card className="grid gap-3">
          <Textarea label="Reply" value={body} onChange={(e) => { setBody(e.target.value); setErr(null); }} error={err ?? undefined} />
          <Dropzone label="Attach files" description="Screenshots or logs, up to 10 MB each" multiple maxSizeBytes={10485760} onFiles={(f) => setFiles((p) => [...p, ...f])} />
          {files.length ? <p className="text-[13px] text-ink3">{files.map((f) => f.name).join(', ')}</p> : null}
          <div className="flex justify-end"><LoadingButton variant="primary" leadingIcon="send" onClick={send}>Send reply</LoadingButton></div>
        </Card>
      )}
    </div>
  );
}
